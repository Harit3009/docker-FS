import { Injectable, Logger } from '@nestjs/common';
import {
  StateGraph,
  GraphNode,
  Annotation,
  START,
  END,
} from '@langchain/langgraph';
import { CATEGORIES } from '../../../constants';
import { z } from 'zod/v4';
import { EmbeddingService, MessageType } from '../embedding/embedding.service';
import { generateMetaDataFromQueryPrompt } from './prompts';
import { PrismaService } from 'src/prisma/prisma.service';

export const ChatStateSchema = z.object({
  summary: z.string().default(''),
  query: z.string(),
  userInfo: z.object({
    name: z.string(),
    email: z.string(),
    id: z.string(),
  }),
  categories: z.array(z.enum(CATEGORIES)).default([]),
  nouns: z.array(z.string()).default([]),
  relevantDates: z
    .array(
      z.object({
        date: z.date(),
        context: z.string(),
      }),
    )
    .default([]),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant', 'tool']),
        content: z.string(),
      }),
    )
    .default([]),
});

export const ChatStateAnnotation = Annotation.Root({
  summary: Annotation<string>(),
  query: Annotation<string>(),

  userInfo: Annotation<{
    name: string;
    email: string;
    id: string;
  }>(),

  categories: Annotation<Array<(typeof CATEGORIES)[number]>>(),
  nouns: Annotation<string[]>(),
  relevantDates: Annotation<Array<{ date: Date; context: string }>>(),
  messages: Annotation<
    Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: string;
    }>
  >({
    reducer: (current, next) => current.concat(next),
    default: () => [],
  }),
});

type StateType = z.infer<typeof ChatStateSchema>;

@Injectable()
export class LangraphChatService {
  private logger = new Logger(LangraphChatService.name);

  constructor(
    private embeddingService: EmbeddingService,
    private prisma: PrismaService,
  ) {}

  private generateMetaDataFromQuery: GraphNode<StateType> = (state) => {
    const messages: MessageType[] = [
      {
        role: 'system',
        content: generateMetaDataFromQueryPrompt,
      },
      {
        role: 'user',
        content: state.query,
      },
    ];

    const data = this.embeddingService.passConversationToAI(messages, {
      task: 'large',
    });
    this.logger.log('data at the end', data);
    return {};
  };

  private createGraph() {
    const workflow = new StateGraph(ChatStateAnnotation)
      .addNode('generateMetaDataFromQuery', this.generateMetaDataFromQuery)
      .addEdge(START, 'generateMetaDataFromQuery')
      .addEdge('generateMetaDataFromQuery', END);

    return workflow.compile();
  }

  async invoke(initialState: StateType) {
    return this.createGraph().invoke(initialState);
  }
}
