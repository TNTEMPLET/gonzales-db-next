"use server";

/**
 * Slice 9 stopped writing ScheduleDraftGame.scoreboard* columns.
 * Check-out and check-in go through ScoreboardCheckout. These actions stay
 * so an old form cannot keep updating the history columns.
 */
export async function checkOutScoreboard(formData: FormData): Promise<void> {
  void formData;
}

export async function checkInScoreboard(formData: FormData): Promise<void> {
  void formData;
}

export async function undoScoreboardReturn(formData: FormData): Promise<void> {
  void formData;
}
