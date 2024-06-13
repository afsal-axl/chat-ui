import type { TextGenerationStreamOutput } from "@huggingface/inference";
import type OpenAI from "openai";
import type { Stream } from "openai/streaming";


/**
 * Transform a stream of OpenAI.Chat.ChatCompletion into a stream of TextGenerationStreamOutput
 */
export async function* openAIChatToTextGenerationStream(
	completionStream: 	any[]
) {
	// const chunks: any[] = [];
	// for await (const chunk of completionStream) {
	// 	chunks.push(chunk);
	// }

	let generatedText = "";
	let tokenId = 0;
	// console.log(completionStream)
	// let tool_calls: any[] = [];
    // let delta: any = null


	for await (const completion of completionStream) {

		const { choices } = completion;
		const content = choices[0]?.delta?.content ?? "";
		const last = choices[0]?.finish_reason === "stop";

		// delta = choices[0]?.delta ?? null;
		

		
		// if (delta?.tool_calls){
		// 	const availableFunctions = {
		// 		delete_ticket: deleteTicket,
		// 	};
		// 	for await (const tcChunk of delta.tool_calls){
		// 		if (tool_calls.length <= tcChunk.index){
		// 			tool_calls.push({ id: "", type: "function", function: { name: "", arguments: "" } });
		// 		}
		// 		const tc = tool_calls[tcChunk.index];
		// 		if (tcChunk.id) {
        //             tc.id += tcChunk.id;
		// 		}
		// 		if (tcChunk.function?.name) {
        //             tc.function.name += tcChunk.function.name;
        //         }
		// 		if (tcChunk.function?.arguments) {
        //             tc.function.arguments += tcChunk.function.arguments;
        //         }	
		// 	}
			
		// }
		if (content) {
			generatedText = generatedText + content;
		}
		const output: TextGenerationStreamOutput = {
			token: {
				id: tokenId++,
				text: content ?? "",
				logprob: 0,
				special: last,
			},
			generated_text: last ? generatedText : null,
			details: null,
		};
		yield output;
	}
	// if (tool_calls.length > 0){
	// console.log(tool_calls)
	// }
}





