import { SlashCommandBuilder } from '@discordjs/builders';

const MyVoteCommand = new SlashCommandBuilder()
    .setName('my_vote')
    .setDescription('View your currently submitted vote');

export default MyVoteCommand.toJSON();