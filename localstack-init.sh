#!/bin/bash
echo "Initializing LocalStack resources..."

# 1. Create the Bucket
awslocal s3 mb s3://local-file-system

# 2. Create the Queue (DLQ first is best practice, but skipping for simplicity)
awslocal sqs create-queue --queue-name file-upload-queue

# 3. Get Queue ARN (Needed for S3 permission)
QUEUE_ARN=$(awslocal sqs get-queue-attributes --queue-url http://localhost:4566/000000000000/file-upload-queue --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

# 4. Configure S3 to Notify SQS
# We create a JSON config on the fly
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

echo "LocalStack resources created!"