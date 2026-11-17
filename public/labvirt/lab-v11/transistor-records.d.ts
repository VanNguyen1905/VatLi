export function validateTransistorRecords(value:unknown,lesson:string):unknown[];
export function transistorConfigurationKey(lesson:string,configuration:Record<string,unknown>):string;
export function toFirestoreTransistorRecord<T>(record:T):T;
export function fromFirestoreTransistorRecord<T>(record:T):T;
