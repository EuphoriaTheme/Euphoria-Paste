import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import pino from 'pino';

// Configure Pino logger
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

export default class AmazonS3DocumentStore {
  constructor(options) {
    this.expire = options.expire;
    this.bucket = options.bucket;
    this.client = new S3Client({ region: options.region });
  }

  async get(key, skipExpire) {
    const request = {
      Bucket: this.bucket,
      Key: key,
    };

    try {
      const data = await this.client.send(new GetObjectCommand(request));
      const body = await data.Body.transformToString('utf-8');

      if (this.expire && !skipExpire) {
        logger.warn('Amazon S3 store cannot set expirations on keys');
      }

      return body;
    } catch (error) {
      logger.error('Error retrieving from Amazon S3', { error });
      return null;
    }
  }

  async set(key, data, skipExpire) {
    const request = {
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: 'text/plain',
    };

    try {
      await this.client.send(new PutObjectCommand(request));

      if (this.expire && !skipExpire) {
        logger.warn('Amazon S3 store cannot set expirations on keys');
      }

      return true;
    } catch (error) {
      logger.error('Error saving to Amazon S3', { error });
      return false;
    }
  }
}
