export type HairScalpAuditMode = "off" | "baseline" | "backing" | "legacy-cap" | "cap-only";
export declare function parseHairScalpAudit(search: string, enabled: boolean): HairScalpAuditMode;
