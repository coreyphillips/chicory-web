/** Construct a partial SDK double for a class with a private constructor. */
export const asOpaque = <T>(value: unknown): T => value as T;
export const asInvalid = asOpaque;
