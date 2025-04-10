import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

export class AppEdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    const imagesDatabaseTable = new dynamodb.Table(this, "imagesDatabaseTable", {
      partitionKey: { name: "imageName", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const imageDeadLetterQueue = new sqs.Queue(this, "ImageDeadLetterQueue", {
      retentionPeriod: cdk.Duration.days(14),
    })

    const imageProcessQueue = new sqs.Queue(this, "image-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      deadLetterQueue: {
        queue: imageDeadLetterQueue,
        maxReceiveCount: 1,
      }
    });

    const imageTopic = new sns.Topic(this, "ImageTopic", {
      displayName: "image topic",
    }); 

    const logNewImageFn = new lambdanode.NodejsFunction(this, "LogNewImageFn", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/logNewImage.ts`,
      timeout: cdk.Duration.seconds(15),
      environment: {
        IMAGES_TABLE_NAME: imagesDatabaseTable.tableName,
      },
    });

    const metadataUpdatingFn = new lambdanode.NodejsFunction(this, "MetadataUpdatingFn", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/metadataUpdating.ts`,
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      environment: {
        IMAGES_TABLE_NAME: imagesDatabaseTable.tableName,
      },
    });

    const removeInvalidImageFn = new lambdanode.NodejsFunction(this, 'RemoveInvalidImageFn', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/removeInvalidImage.ts`,
      timeout: cdk.Duration.seconds(15),
      environment: {
        BUCKET_NAME: imagesBucket.bucketName,
      }
    });

    const logNewImageEventSource = new events.SqsEventSource(imageProcessQueue, {
      batchSize: 5,
    });
    logNewImageFn.addEventSource(logNewImageEventSource);

    const removeInvalidImageEventSource = new events.SqsEventSource(imageDeadLetterQueue, {
      batchSize: 5,
    });
    removeInvalidImageFn.addEventSource(removeInvalidImageEventSource);

    imageTopic.addSubscription(
      new subs.SqsSubscription(imageProcessQueue)
    );

    imageTopic.addSubscription(
      new subs.LambdaSubscription(metadataUpdatingFn)
    );

    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(imageTopic)
    );

    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      new s3n.SnsDestination(imageTopic)
    );

    logNewImageFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:PutItem", "dynamodb:DeleteItem"],
        resources: [imagesDatabaseTable.tableArn],
      })
    );

    metadataUpdatingFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:UpdateItem"],
        resources: [imagesDatabaseTable.tableArn],
      })
    );

    removeInvalidImageFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:DeleteObject"],
        resources: [`${imagesBucket.bucketArn}/*`],
      })
    );

    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });

    new cdk.CfnOutput(this, "imageTopicArn", {
      value: imageTopic.topicArn,
    });
  }
}
