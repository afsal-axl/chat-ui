import { writable } from "svelte/store";
export interface SaveOutput {
	useSearch: boolean;
	nItems: number;
}
export const saveOutput = writable<SaveOutput>({
	useSearch: false,
	nItems: 5,
});
