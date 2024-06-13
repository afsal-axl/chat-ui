import { z } from "zod";
import { openAICompletionToTextGenerationStream } from "./openAICompletionToTextGenerationStream";
import { openAIChatToTextGenerationStream } from "./openAIChatToTextGenerationStream";
import type { CompletionCreateParamsStreaming } from "openai/resources/completions";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import { buildPrompt } from "$lib/buildPrompt";
import { env } from "$env/dynamic/private";
import type { Endpoint } from "../endpoints";
import { Console, log } from "console";
import axios from 'axios';

type Tool = {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: {
			type: "object";
			properties: Record<string, { type: string; description: string }>;
			required: string[];
		};
	};
};

const tools: Tool[] = [
	{
		type: "function",
		function: {
			name: "save_output",
			description: "Save the generated text in my drive",
			parameters: {
				type: "object",
				properties: {
					text: {
						type: "string",
						description: "The whole generated text",
					}
				},
				required: ["text"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "sent_mail",
			description: "Send a mail to the respective mail id",
			parameters: {
				type: "object",
				properties: {
					text: {
						type: "string",
						description: "The whole generated content of the mail",
					},
					mail_id: {
						type: "string",
						description: "The mail id of the respective receiver",
					},
					subject: {
						type: "string",
						description: "The subject of the mail"
					}
				},
				required: ["text", "mail_id", "subject"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "create_ticket",
			description: "create a new ticket in ServiceNow",
			parameters: {
				type: "object",
				properties: {
					requester: {
						type: "string",
						description: "The person who raised the ticket",
					},
					subject: {
						type: "string",
						description: "The subject of the raised ticket",
					},
					description: {
						type: "string",
						description: "The description of the raised ticket"
					}
				},
				required: ["requester", "subject", "description"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "delete_ticket",
			description: "delete an existing ticket in ServiceNow",
			parameters: {
				type: "object",
				properties: {
					ticket_id: {
						type: "string",
						description: "The id of the ticket to be deleted",
					}
				},
				required: ["ticket_id"],
			},
		},
	}
];

const tool_choice = "auto"

export const endpointOAIParametersSchema = z.object({
	weight: z.number().int().positive().default(1),
	model: z.any(),
	type: z.literal("openai"),
	baseURL: z.string().url().default("https://api.openai.com/v1"),
	apiKey: z.string().default(env.OPENAI_API_KEY ?? "sk-"),
	completion: z
		.union([z.literal("completions"), z.literal("chat_completions")])
		.default("chat_completions"),
	defaultHeaders: z.record(z.string()).optional(),
	defaultQuery: z.record(z.string()).optional(),
	extraBody: z.record(z.any()).optional(),
});

export async function endpointOai(
	input: z.input<typeof endpointOAIParametersSchema>
): Promise<Endpoint> {
	const { baseURL, apiKey, completion, model, defaultHeaders, defaultQuery, extraBody } =
		endpointOAIParametersSchema.parse(input);
	let OpenAI;
	try {
		OpenAI = (await import("openai")).OpenAI;
	} catch (e) {
		throw new Error("Failed to import OpenAI", { cause: e });
	}

	const openai = new OpenAI({
		apiKey: apiKey ?? "sk-",
		baseURL,
		defaultHeaders,
		defaultQuery,
	});

	if (completion === "completions") {
		return async ({ messages, preprompt, continueMessage, generateSettings }) => {
			const prompt = await buildPrompt({
				messages,
				continueMessage,
				preprompt,
				model,
			});

			const parameters = { ...model.parameters, ...generateSettings };
			const body: CompletionCreateParamsStreaming = {
				model: model.id ?? model.name,
				prompt,
				stream: true,
				max_tokens: parameters?.max_new_tokens,
				stop: parameters?.stop,
				temperature: parameters?.temperature,
				top_p: parameters?.top_p,
				frequency_penalty: parameters?.repetition_penalty,
			};

			const openAICompletion = await openai.completions.create(body, {
				body: { ...body, ...extraBody, tools, tool_choice },
			});

			return openAICompletionToTextGenerationStream(openAICompletion);
		};
	} else if (completion === "chat_completions") {
		return async ({ messages, preprompt, generateSettings }) => {
			let messagesOpenAI = messages.map((message) => ({
				role: message.from,
				content: message.content,
			}));
			// console.log(messagesOpenAI)

			if (messagesOpenAI?.[0]?.role !== "system") {
				messagesOpenAI = [{ role: "system", content: "" }, ...messagesOpenAI];
			}

			if (messagesOpenAI?.[0]) {
				messagesOpenAI[0].content = preprompt ?? "";
			}

			const parameters = { ...model.parameters, ...generateSettings };
			const body: ChatCompletionCreateParamsStreaming = {
				model: model.id ?? model.name,
				messages: messagesOpenAI,
				stream: true,
				max_tokens: parameters?.max_new_tokens,
				stop: parameters?.stop,
				temperature: parameters?.temperature,
				top_p: parameters?.top_p,
				frequency_penalty: parameters?.repetition_penalty,
			};
			console.log(body.messages?.[0].role)
			console.log(body.messages)
			body.messages[0].content = "If the user requests a function call, please ask for confirmation with the function arguments before executing the function."
			console.log(body.messages)

			const openChatAICompletion = await openai.chat.completions.create(body, {
				body: { ...body, ...extraBody, tools, tool_choice },
			});

			const chunks: any[] = [];
			for await (const chunk of openChatAICompletion) {
				chunks.push(chunk);
			}

			let tool_call: any[] = [];
			let delta: any = null
			for await (const chun of chunks) {
				const { choices } = chun;
				const content = choices[0]?.delta?.content ?? "";
				const last = choices[0]?.finish_reason === "stop";

				delta = choices[0]?.delta ?? null;

				if (delta?.tool_calls) {

					for await (const tcChunk of delta.tool_calls) {
						if (tool_call.length <= tcChunk.index) {
							tool_call.push({ id: "", type: "function", function: { name: "", arguments: "" } });
						}
						const tc = tool_call[tcChunk.index];
						if (tcChunk.id) {
							tc.id += tcChunk.id;
						}
						if (tcChunk.function?.name) {
							tc.function.name += tcChunk.function.name;
						}
						if (tcChunk.function?.arguments) {
							tc.function.arguments += tcChunk.function.arguments;
						}
					}

				}
			}
			if (tool_call.length > 0) {
				body.messages.push({ role: "assistant", tool_calls: tool_call });
				const availableFunctions = {
					delete_ticket: deleteTicket,
					save_output: saveOutput,
					sent_mail: sentMail,
					create_ticket: createTicket,

				};

				for await (const element of tool_call) {
					const function_name = (element.function.name as keyof typeof availableFunctions);
					const function_to_call = availableFunctions[function_name];
					const function_args = JSON.parse(element.function.arguments);
					const function_response = await function_to_call(function_args);
					body.messages.push(
						{
							tool_call_id: element['id'],
							role: "tool",
							name: function_name,
							content: function_response,
						}
					);


				}
				console.log(body)
				const secondopenChatAICompletion = await openai.chat.completions.create(body, {
					body: { ...body, ...extraBody, tools, tool_choice },
				});

				const chunks_1: any[] = [];
				for await (const chunk of secondopenChatAICompletion) {
					chunks_1.push(chunk);
				}
				return openAIChatToTextGenerationStream(chunks_1);


			}

			// console.log({ ...body, ...extraBody, tools, tool_choice })




			return openAIChatToTextGenerationStream(chunks);
		};
	} else {
		throw new Error("Invalid completion type");
	}
}


interface Payload {
	action: string;
	parameters: {
		ticket_id: string;
	};
}

//   interface ExecutionResponse {
// 	id: string;
//   }

//   interface StatusResponse {
// 	status: string;
// 	result: any;
//   }

interface TicketObject {
	ticket_id: string;
	// Add more properties if needed
}


async function deleteTicket(ticket: TicketObject): Promise<any> {
	const payload: Payload = {
		action: "anaita_actions.delete_ticket",
		parameters: {
			ticket_id: ticket.ticket_id
		}
	};

	const headers = {
		'St2-Api-Key': env.ST2_API,
		'Content-Type': 'application/json'
	};

	try {
		const postResponse = await axios.post("https://axlstack.accelnomics.com/api/v1/executions", payload, { headers: headers });

		const id = postResponse.data.id;
		const url = `https://axlstack.accelnomics.com/api/v1/executions?id=${id}`;

		let status: string;
		let output: any;

		do {
			const statusResponse = await axios.get(url, { headers: headers });

			status = statusResponse.data[0].status;
			output = statusResponse.data[0].result;
		} while (status === "running" || status === "requested" || status === "scheduled");
		output['status'] = status;

		return JSON.stringify(output);

	} catch (error) {
		console.error('Error deleting ticket:', error);
		throw error;
	}
}



interface TextObject {
	text: string;
	// Add more properties if needed
}
async function saveOutput(out: TextObject): Promise<any> {
	const payload = {
		action: "anaita_actions.upload_onedrive",
		parameters: {
			client_id: env.CLIENT_IDS,
			client_secret: env.CLIENT_SECRETS,
			tenant_id: env.TENANT_IDS,
			text: out.text,
			usr_id: env.USR_IDS
		}
	};

	const headers = {
		'St2-Api-Key': env.ST2_API,
		'Content-Type': 'application/json'
	};

	try {
		const postResponse = await axios.post("https://axlstack.accelnomics.com/api/v1/executions", payload, { headers: headers });

		const id = postResponse.data.id;
		const url = `https://axlstack.accelnomics.com/api/v1/executions?id=${id}`;

		let status: string;
		let output: any;

		do {
			const statusResponse = await axios.get(url, { headers: headers });

			status = statusResponse.data[0].status;
			output = statusResponse.data[0].result;
		} while (status === "running" || status === "requested" || status === "scheduled");
		output['status'] = status;
		console.log(output)

		return JSON.stringify(output);

	} catch (error) {
		console.error('Error saving the text:', error);
		throw error;
	}

}
interface MailObject {
	text: string;
	mail_id: string;
	subject: string;
	// Add more properties if needed
}

async function sentMail(mail: MailObject): Promise<any> {
	const payload = {
		action: "anaita_actions.send_mail",
		parameters: {
			email: mail.mail_id,
			text: mail.text,
			subject: mail.subject
		}
	};

	const headers = {
		'St2-Api-Key': env.ST2_API,
		'Content-Type': 'application/json'
	};

	try {
		const postResponse = await axios.post("https://axlstack.accelnomics.com/api/v1/executions", payload, { headers: headers });

		const id = postResponse.data.id;
		const url = `https://axlstack.accelnomics.com/api/v1/executions?id=${id}`;

		let status: string;
		let output: any;

		do {
			const statusResponse = await axios.get(url, { headers: headers });

			status = statusResponse.data[0].status;
			output = statusResponse.data[0].result;
		} while (status === "running" || status === "requested" || status === "scheduled");
		output['status'] = status;
		console.log(output)

		return JSON.stringify(output);

	} catch (error) {
		console.error('Error sending the mail:', error);
		throw error;
	}

}
interface NewTicketObject {
	requester: string;
	subject: string;
	description: string;
	// Add more properties if needed
}
async function createTicket(newTicket: NewTicketObject): Promise<any> {
	const payload = {
		action: "anaita_actions.create_ticket",
		parameters: {
			requester: newTicket.requester,
			subject: newTicket.subject,
			description: newTicket.description
		}
	};


	const headers = {
		'St2-Api-Key': env.ST2_API,
		'Content-Type': 'application/json'
	};


	try {
		const postResponse = await axios.post("https://axlstack.accelnomics.com/api/v1/executions", payload, { headers: headers });

		const id = postResponse.data.id;
		const url = `https://axlstack.accelnomics.com/api/v1/executions?id=${id}`;

		let status: string;
		let output: any;

		do {
			const statusResponse = await axios.get(url, { headers: headers });

			status = statusResponse.data[0].status;
			output = statusResponse.data[0].result;
		} while (status === "running" || status === "requested" || status === "scheduled");
		output['status'] = status;
		console.log(output)

		return JSON.stringify(output);

	} catch (error) {
		console.error('Error creating new ticket:', error);
		throw error;
	}

}