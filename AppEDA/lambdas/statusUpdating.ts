import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { SNSEvent, SNSHandler } from "aws-lambda";

const dynamodb = new DynamoDBClient({});

export const handler: SNSHandler = async (event: SNSEvent) => {
    for (const record of event.Records) {
        const message = JSON.parse(record.Sns.Message);
        const { id, update } = message;
        const { status, reason } = update;
        console.log(`Updating status ${id} ${status}`);
        try {
            const updateParams = {
                TableName: process.env.IMAGES_TABLE_NAME,
                Key: {
                    imageName: { S: id },
                },
                UpdateExpression: "SET #status = :status, #reason = :reason",
                ExpressionAttributeNames: {
                    "#status": "status",
                    "#reason": "reason",
                },
                ExpressionAttributeValues: {
                    ":status": { S: status },
                    ":reason": { S: reason },
                },
            }
            await dynamodb.send(new UpdateItemCommand(updateParams));
            console.log(`Successfull update: ${id}`);
        } catch (err) {
            console.error("Error:", err);
            throw err;
        }
    }
}
