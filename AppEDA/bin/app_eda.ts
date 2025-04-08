#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AppEdaStack } from "../lib/app_eda-stack";

const app = new cdk.App();
new AppEdaStack(app, "AppEdaStack", {
  env: { region: "eu-west-1" },
});
