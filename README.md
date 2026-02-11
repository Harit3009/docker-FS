# docker-FS

A cloud-based file storage system built with NestJS that provides a Google Drive-like experience with intelligent document search and AI-powered chat capabilities.

## 🌟 Features

- **File Storage & Management**: Upload, organize, and manage files and folders with a hierarchical structure
- **Authentication**: Secure Google OAuth 2.0 authentication
- **Multipart Upload**: Support for large file uploads using S3 multipart upload
- **Folder Upload**: Upload entire folders as zip archives with automatic extraction
- **Document Search**: Semantic search powered by OpenSearch with AI embeddings
- **AI Chat**: Chat with your documents using AI (Google Gemini, OpenAI, Groq)
- **Real-time Processing**: Event-driven architecture using Kafka for file processing
- **Trash Management**: Soft delete functionality with scheduled cleanup
- **Document Indexing**: Automatic text extraction and indexing from PDFs, DOCX, CSV files

## 🏗️ Architecture

The application uses a microservices-inspired architecture with the following components:

- **NestJS API**: REST API for file operations and user management
- **PostgreSQL**: Relational database for metadata storage (files, folders, users)
- **S3 (LocalStack)**: Object storage for file content
- **Kafka**: Message broker for asynchronous file processing
- **OpenSearch**: Full-text and semantic search engine
- **Google Gemini/OpenAI**: AI services for embeddings and chat

### Event-Driven Processing

Files uploaded to S3 trigger a series of Kafka-based processing jobs:
1. **File Creation**: Record file metadata in PostgreSQL
2. **Zip Extraction**: Extract folder uploads automatically
3. **Document Parsing**: Extract text from documents (PDF, DOCX, CSV)
4. **Embedding Generation**: Generate vector embeddings for semantic search
5. **OpenSearch Indexing**: Index documents for search capabilities

## 🛠️ Technology Stack

### Backend
- **Framework**: NestJS (Node.js/TypeScript)
- **Database**: PostgreSQL 15 with Prisma ORM
- **Object Storage**: AWS S3 (LocalStack for local development)
- **Message Queue**: Apache Kafka (KRaft mode)
- **Search Engine**: OpenSearch 2.11
- **Authentication**: Passport.js with JWT and Google OAuth

### AI/ML
- **Embeddings**: Google Gemini API
- **Chat**: Google Gemini / OpenAI / Groq SDK
- **Framework**: LangChain for AI workflows

### DevOps
- **Containerization**: Docker & Docker Compose
- **API Documentation**: TypeScript decorators with class-validator
- **Code Quality**: ESLint, Prettier
- **Testing**: Jest

## 📋 Prerequisites

- Node.js >= 18.x
- Docker & Docker Compose
- npm or yarn
- Google Cloud Platform account (for OAuth)
- API keys for AI services (Google Gemini, OpenAI, or Groq)

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd docker-FS
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgres://admin:password@localhost:5432/file_system"

# Server
PORT=4000
NODE_ENV=development

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

# JWT
JWT_SECRET=your_jwt_secret_key

# AWS S3 (LocalStack)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_ENDPOINT=http://localhost:4566
S3_BUCKET_NAME=local-file-system

# Kafka
KAFKA_BROKER=localhost:9092
KAFKA_GROUP_ID=file-system-consumer-group

# OpenSearch
OPENSEARCH_NODE=http://localhost:9200
OPENSEARCH_USERNAME=admin
OPENSEARCH_PASSWORD=StrongPassword123  # Change this in production!

# AI Services (choose one or configure multiple)
# Google Gemini
GOOGLE_GEMINI_API_KEY=your_gemini_api_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Groq
GROQ_API_KEY=your_groq_api_key
```

### 3. Start Infrastructure Services

```bash
# Start all services (PostgreSQL, Kafka, OpenSearch, LocalStack)
docker-compose up -d

# Check service health
docker-compose ps
```

Services will be available at:
- PostgreSQL: `localhost:5432`
- Kafka: `localhost:9092`
- Kafka UI: `http://localhost:8080`
- OpenSearch: `http://localhost:9200`
- OpenSearch Dashboards: `http://localhost:5601`
- LocalStack (S3): `http://localhost:4566`

### 4. Install Dependencies

```bash
npm install
```

### 5. Database Setup

```bash
# Run Prisma migrations
npm run migrate:dev

# This command will:
# - Apply database migrations
# - Ensure indexes are created
# - Generate Prisma client
```

### 6. Run the Application

```bash
# Development mode with hot-reload
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

The API will be available at `http://localhost:4000`

## 📚 API Endpoints

### Authentication

- `GET /auth/google/signin` - Initiate Google OAuth login
- `GET /auth/google/callback` - OAuth callback handler
- `GET /auth/me` - Get current user information (requires JWT)

### File System Operations

#### Folders
- `POST /file-system/create-folder` - Create a new folder
- `GET /file-system/list-directories-by-parent` - List subfolders
- `PUT /file-system/rename-folder` - Rename a folder
- `DELETE /file-system/folder/:folderId` - Delete a folder (soft delete)

#### Files
- `GET /file-system/list-files-by-parent` - List files in a folder
- `POST /file-system/put-signed-url` - Get signed URL for file upload
- `GET /file-system/get-signed-url/:fileId` - Get signed URL for file download
- `DELETE /file-system/file/:fileId` - Delete a file (soft delete)

#### Multipart Upload (Large Files)
- `POST /file-system/multipart-upload/get-upload-id` - Initiate multipart upload
- `POST /file-system/multipart-upload/get-upload-urls` - Get URLs for parts
- `POST /file-system/multipart-upload/complete-upload` - Complete upload

#### Folder Upload
- `POST /file-system/folder-upload/initiate` - Upload folder as zip

#### Search & Chat
- `POST /file-system/search-docs` - Semantic document search
- `POST /file-system/chat` - Chat with documents using AI

## 🔧 Development

### Running Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov

# Watch mode
npm run test:watch
```

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format
```

### Database Management

```bash
# Create a new migration
npx prisma migrate dev --name migration_name

# ⚠️ WARNING: Reset database (DELETES ALL DATA - use only in development)
npx prisma migrate reset

# Open Prisma Studio (GUI for database)
npx prisma studio
```

## 📦 Project Structure

```
docker-FS/
├── src/
│   ├── auth/                    # Authentication module (Google OAuth, JWT)
│   ├── file-system/            # File & folder operations
│   ├── s3-module/              # S3 integration
│   ├── bridge/                 # Event processing & integrations
│   │   ├── kafka/              # Kafka service
│   │   ├── kafka-create/       # File creation consumer
│   │   ├── kafka-delete-consumer/  # File deletion consumer
│   │   ├── kafka-extract-zip/  # Zip extraction consumer
│   │   ├── kafka-index-file-service/ # Document indexing
│   │   ├── open-search/        # OpenSearch integration
│   │   ├── embedding/          # AI embeddings & chat
│   │   ├── pdf-parser/         # Document parsing
│   │   └── delete-trash-scheduler/ # Scheduled trash cleanup
│   ├── prisma/                 # Database service
│   ├── decorators/             # Custom decorators
│   └── main.ts                 # Application entry point
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── migrations/             # Database migrations
├── docker-compose.yaml         # Infrastructure services
├── localstack-init.sh          # LocalStack initialization script
└── package.json
```

## 🔐 Security Features

- JWT-based authentication
- Google OAuth 2.0 integration
- Request validation using class-validator
- CORS enabled
- User-based resource authorization
- Soft delete for data recovery

## 🚀 Deployment

### Using Docker

```bash
# Build the application
npm run build

# Build Docker image
docker build -t docker-fs .

# Run with docker-compose
docker-compose up -d
```

### Environment Variables for Production

Ensure you update the following for production:
- Use production database credentials
- Use real AWS S3 instead of LocalStack
- Configure production Kafka cluster
- Set strong JWT secret
- Configure proper CORS origins
- Use production AI API keys

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the UNLICENSED license.

## 🙏 Acknowledgments

Built with:
- [NestJS](https://nestjs.com/) - Progressive Node.js framework
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [Apache Kafka](https://kafka.apache.org/) - Distributed event streaming
- [OpenSearch](https://opensearch.org/) - Search and analytics engine
- [LocalStack](https://localstack.cloud/) - Local AWS cloud stack
