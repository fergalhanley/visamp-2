export function visualisationSaveError(error: { code?: string; message: string }): string {
  if (error.code === "23505" && error.message.includes("visualisations_title_key_unique")) {
    return "That title is already taken. Choose another name.";
  }
  return error.message;
}
