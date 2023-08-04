import { SlashCommandBuilder } from "@discordjs/builders";

const candidatesCommand = new SlashCommandBuilder()
  .setName("candidates")
  .setDescription("View the current candidates for joining the group");

export default candidatesCommand.toJSON();
