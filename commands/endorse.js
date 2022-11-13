import { SlashCommandBuilder } from '@discordjs/builders';

const endorseCommand = new SlashCommandBuilder()
    .setName('endorse')
    .setDescription('Endorse a new user to help them join the group')
    .addUserOption(option => 
        option.setName('user')
            .setDescription("The user you'd like to endorse")
            .setRequired(true));

export default endorseCommand.toJSON();