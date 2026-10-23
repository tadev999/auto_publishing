import fs from 'node:fs';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Settings } from '../config.js';

function getS3Client(settings: Settings): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${settings.secret('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: settings.secret('R2_ACCESS_KEY_ID'),
      secretAccessKey: settings.secret('R2_SECRET_ACCESS_KEY'),
    },
  });
}

export async function upload(settings: Settings, filePath: string, key: string): Promise<string> {
  const client = getS3Client(settings);
  const fileStream = fs.createReadStream(filePath);
  const bucket = settings.secret('R2_BUCKET');

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileStream,
    ContentType: 'video/mp4',
  });

  await client.send(cmd);
  return key;
}

export async function presignedUrl(
  settings: Settings,
  key: string,
  expiresSeconds: number = 6 * 3600
): Promise<string> {
  const client = getS3Client(settings);
  const bucket = settings.secret('R2_BUCKET');

  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return getSignedUrl(client, cmd, { expiresIn: expiresSeconds });
}
