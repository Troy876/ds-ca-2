import { SQSHandler } from "aws-lambda";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});
const bucketName = process.env.BUCKET_NAME!;

export const handler: SQSHandler = async (event) => {
    console.log("Event: ", JSON.stringify(event));
    for (const record of event.Records) {
        const recordBody = JSON.parse(record.body);
        const snsMessage = JSON.parse(recordBody.Message);
        if (snsMessage.Records) {
            for (const messageRecord of snsMessage.Records) {
                const s3Object = messageRecord.s3;
                const objectKey = decodeURIComponent(s3Object.object.key.replace(/\+/g, " "));
                const fileExtension = objectKey.split(".").pop()?.toLowerCase();
                if (fileExtension !== "jpeg" && fileExtension !== "png") {
                    console.warn(`Invalid file type: ${objectKey}`);
                    try {
                        await s3.send(
                            new DeleteObjectCommand({
                                Bucket: bucketName,
                                Key: objectKey,
                            })
                        );
                        console.log(`Removed invalid: ${objectKey}`);
                    } catch (deleteError) {
                        console.error(`Remove failed:`,deleteError);
                    }
                    throw new Error(`Invalid extension: ${fileExtension}`);
                }
            }
        }
    }
}
