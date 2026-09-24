/* eslint-disable @typescript-eslint/no-explicit-any */
export type Confidence = {
  key: "none" | "tiny" | "small" | "moderate" | "strong";
  label: string;
  rank: number;
  completeness: number;
  partial?: boolean;
};
export function norm(value: unknown): string;
export function knownNumber(value: unknown): number | null;
export function knownSum(values: unknown[], options?: { requireComplete?: boolean }): number | null;
export function accuracy(correct: unknown, errors: unknown): number | null;
export function sampleConfidence(totalQuestions: unknown, sessions: unknown, completeness?: number): Confidence;
export function trendFromEvents(events?: Array<{date?: string | null; accuracy?: number | null}>): {key:string;label:string;delta:number|null;events:number};
export function safeEditalMatch(subject: string, axes?: any[]): {subject:string;match:string;axes:any[]}|null;
export function buildSeedfIntelligence(input?: any): any;
