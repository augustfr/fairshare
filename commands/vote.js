import { SlashCommandBuilder } from '@discordjs/builders';

const voteCommand = new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Vote on transaction fee and daily income')
    .addNumberOption(option => 
        option.setName('fee')
            .setDescription("The percentage fee that will be added on to each transaction ('5' for '5%')")
            .setRequired(true))
    .addNumberOption(option => 
        option.setName('income')
            .setDescription('The amount of daily income for each member')
            .setRequired(true));

export default voteCommand.toJSON();