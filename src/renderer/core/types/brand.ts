type Brand<K, T> = K & { __brand: T };

export type Seed = Brand<number, 'Seed'>;
export type Port = Brand<number, 'Port'>;
export type PID = Brand<number, 'PID'>;
export type Milliseconds = Brand<number, 'Milliseconds'>;

export const asSeed = (n: number): Seed => n as Seed;
export const asPort = (n: number): Port => n as Port;
export const asPID = (n: number): PID => n as PID;
export const asMs = (n: number): Milliseconds => n as Milliseconds;
