import { SlashCommandBuilder } from '@discordjs/builders';

const endorseCommand = new SlashCommandBuilder()
    .setName('endorse')
    .setDescription('Endorse a new user to help them join the group')
    .addUserOption(option => 
        option.setName('user')
            .setDescription("The percentage fee that will be added on to each transaction ('5' for '5%')")
            .setRequired(true));

export default endorseCommand.toJSON();