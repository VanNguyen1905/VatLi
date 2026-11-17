export type TransistorLessonDefinition={course:number;part:number;pages:number[];title:string;table:string;keys:string[];headers:string[];parts:Array<[string,string,number?]>;guide:string[];note:string};
export const TRANSISTOR_LESSONS:Readonly<Record<string,TransistorLessonDefinition>>;
export function isTransistorLesson(id:unknown):boolean;
export function transistorTable(lesson:string,records?:Array<{key:string;columns:string[]}>):{headers:string[];rows:string[][];threshold:{key:string;columns:string[]}|null};
