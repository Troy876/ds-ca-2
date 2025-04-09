import { SNSHandler } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const dynamoDb = new DynamoDBClient({ region: "eu-west-1" });
export const handler: SNSHandler = async (event) => {
    console.log("Received event: ", JSON.stringify(event));
    for (const record of event.Records) {
        const snsMessage = JSON.parse(record.Sns.Message);
        const metadataType = record.Sns.MessageAttributes?.metadata_type?.Value;
        const imageID = snsMessage.id;
        const value = snsMessage.value;
        console.log("Type: ", metadataType);
        console.log("Image ID: ", imageID);
        console.log("Value: ", value);
        if (["Caption", "Date", "Photographer"].includes(metadataType)) {
            const updateParams = {
                TableName: process.env.IMAGES_TABLE_NAME!,
                Key: {
                    imageName: { S: imageID },
                },
                UpdateExpression: "SET #type = :value",
                ExpressionAttributeNames: {
                    "#type": metadataType,
                },
                ExpressionAttributeValues: {
                    ":value": { S: value },
                },
            };
            try {
                await dynamoDb.send(new UpdateItemCommand(updateParams));
                console.log(`Updated metadata for  ${imageID}`);
            } catch (error) {
                console.error("Error:", error);
            }
        } else {
            console.log(`Invalid:${metadataType}`);
        }
    }
}
