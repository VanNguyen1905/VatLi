export function validateRecords(value:unknown,lesson:string):unknown[];
export function configurationSignature(configuration:Record<string,unknown>):string;
export function toFirestoreRecord<T>(record:T):T;
export function fromFirestoreRecord<T>(record:T):T;
