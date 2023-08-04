import { SlashCommandBuilder } from "@discordjs/builders";

const undelegateCommand = new SlashCommandBuilder()
  .setName("undelegate_endorsements")
  .setDescription("Undelegate your endorsing power.");

export default undelegateCommand.toJSON();
