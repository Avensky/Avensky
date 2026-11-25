export interface StagingRelease {
  id: string;
  assets: Record<string, { sha256: string; size: number }>;
  previews: Record<string, string>;
  wardrobeRevisions: string[];
}
export function stagingRelease(file?: string, fittedHair?: string): StagingRelease;
export const publicRoot: URL;
export const releaseOutput: URL;
