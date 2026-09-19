/** Only the create redirect carries this transient, client-only marker. */
export const STARTER_PROMPT_HASH = "#starter-prompt";

export const starterPromptTemplates = [
  'Generate a visualization, either 2D or 3D, inspired by the phrase "{title}". Use audio detection to animate the position of the graphics, manipulate their colors, or both.',
  'Create a 2D or 3D visual interpretation of "{title}". Let the bass drive the movement of the main shapes and higher audio frequencies shift their colors, creating a scene that responds to the music.',
  'Imagine "{title}" as an abstract world in 2D or 3D. Use audio detection to make its forms expand, drift, and change color with the energy of the music.',
  'Build a flowing 2D or 3D visualization inspired by "{title}". Use audio levels to guide the paths of particles or ribbons, with color changes that follow the rhythm.',
  'Turn the phrase "{title}" into a playful 2D or 3D composition. Let detected beats reshape the arrangement and let the sound spectrum influence its palette.',
  'Design a cinematic 2D or 3D visualization that captures the mood of "{title}". Use audio detection to move layered graphics and gradually transform their colors as the music changes.',
  'Create a kaleidoscopic 2D or 3D visualization inspired by "{title}". Make repeating forms rotate and unfold in response to audio levels, with colors that evolve across the sound spectrum.',
  'Explore "{title}" through an organic 2D or 3D visualization. Use audio detection to make forms grow, sway, and pulse, blending colors according to the intensity of the music.',
  'Generate a geometric 2D or 3D scene inspired by "{title}". Use different audio frequency bands to move groups of shapes and alter their colors, balancing energetic moments with calm ones.',
  'Interpret "{title}" as a dreamlike 2D or 3D visualization. Let audio detection guide a smooth dance of light and shapes, changing their positions and colors with the music.',
] as const;

export function createStarterPrompt(title: string): string {
  const template =
    starterPromptTemplates[
      Math.floor(Math.random() * starterPromptTemplates.length)
    ] ?? starterPromptTemplates[0];
  return template.replace("{title}", () => title);
}
