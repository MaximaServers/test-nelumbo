export interface LogContext {
    [key: string]: string | number | boolean | object | null | undefined;
    audit?: boolean;
    error?: Error | Record<string, string | number | boolean | object | null | undefined> | string;
    env?: string;
    to?: string;
    subject?: string;
    messageId?: string;
    path?: string;
    code?: string | number;
}
