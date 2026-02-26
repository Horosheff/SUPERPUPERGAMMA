/**
 * One slide in the presentation.
 */
export interface Slide {
  title: string;
  body: string[];
  notes?: string;
}

/**
 * Blackboard: array of 5 slides (index 0..4). null = not yet written.
 */
export type Blackboard = (Slide | null)[];

export const SLIDE_COUNT = 5;
