#!/bin/bash
echo "Initializing LocalStack resources..."

# 1. Create the Bucket
awslocal s3 mb s3://local-file-system

# 2. Create the Queue
awslocal sqs create-queue --queue-name file-upload-queue

# 3. Get Queue ARN
QUEUE_ARN=$(awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/file-upload-queue --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

# 4. Configure S3 to Notify SQS
cat <<EOF > /tmp/s3-notification.json
{
  "QueueConfigurations": [
    {
      "QueueArn": "$QUEUE_ARN",
      "Events": ["s3:ObjectCreated:*"]
    }
  ]
}
EOF

awslocal s3api put-bucket-notification-configuration --bucket local-file-system --notification-configuration file:///tmp/s3-notification.json
awslocal s3api put-bucket-cors --bucket local-file-system --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedOrigins": ["*"],
      "ExposeHeaders": ["ETag"]
    }
  ]
}'

echo "Base LocalStack resources created!"

# ---------------------------------------------------------
# NEW LOGIC: Deploy Lambda and attach to SQS
# ---------------------------------------------------------

echo "Deploying Lambda function..."
awslocal lambda create-function \
  --function-name s3-event-handler \
  --runtime nodejs20.x \
  --role arn:aws:iam::000000000000:role/dummy-role \
  --handler index.handler \
  --zip-file fileb:///opt/lambda-build/function.zip # <-- Back to the zip file

echo "Mapping SQS queue to trigger Lambda..."
awslocal lambda create-event-source-mapping \
  --function-name s3-event-handler \
  --batch-size 10 \
  --event-source-arn "$QUEUE_ARN"

echo "Initialization Complete!"