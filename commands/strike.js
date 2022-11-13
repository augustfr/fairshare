import { SlashCommandBuilder } from '@discordjs/builders';

const strikeCommand = new SlashCommandBuilder()
    .setName('strike')
    .setDescription('Add a strike to an existing group member')
    .addUserOption(option => 
        option.setName('user')
            .setDescription("The user you'd like to add a strike to")
            .setRequired(true));

export default strikeCommand.toJSON();