import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service';
import { OpensearchService } from '../open-search/open-search.service';
import { OpensearchIndexableDocument } from 'types/opensearch-index';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AiRetrievalService {
  private logger = new Logger(AiRetrievalService.name);
  constructor(
    private readonly embeddingService: EmbeddingService,
    private oss: OpensearchService,
    private readonly prisma: PrismaService,
  ) {}

  async answerFromDocument(query: string, userId: string) {
    const queryEmbeddings = await this.embeddingService.generateEmbeddings(
      query,
      'QUERY',
    );

    const docs = (await this.oss.queryChunkDocuments(
      queryEmbeddings,
      query,
      userId,
    )) as OpensearchIndexableDocument[];
    this.logger.log('docs from opensearch retrieval', docs);

    const uniqueIdsObj = docs.reduce(
      (acc, doc) => ({ ...acc, [doc.id.split('-chunk-')[0]]: true }),
      {},
    );

    const uniqueIds = Object.keys(uniqueIdsObj);
    this.logger.log('uniqueIds for retrieval', uniqueIds, uniqueIdsObj);

    const jsonBRecords = await this.prisma.fileMetadata.findMany({
      where: {
        fileId: {
          in: uniqueIds,
        },
      },
    });

    const innerXml = jsonBRecords.map((d) => {
      const { semanticMetadata: meta, fileId } = d;
      const { embedding, ...semanticMetadata } = meta as Record<string, string>;
      return `<Document id="${fileId}">
        <Context>
            ${semanticMetadata}
        </Context>
        <Retrieved_Chunks>
        ${docs
          .filter((doc) => doc.id.startsWith(fileId))
          .reduce((acc, doc) => {
            return `[chunk ${doc.id.split('-chunk-')[1]}]: ${doc.text}\n` + acc;
          }, '')}
        </Retrieved_Chunks>
        </Document>`;
    });

    const xmlString = `<Documents>${innerXml}</Documents>`;

    this.logger.log('xml is here >>>>>>>>', xmlString);

    return this.embeddingService.chatFromSearchedDocs(query, xmlString);
  }
}
