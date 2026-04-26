import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import * as path from 'path';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const echoFunction = new lambdaNodejs.NodejsFunction(this, 'EchoFunction', {
      entry: path.join(__dirname, '../../apps/api/src/handlers/echo.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
    });

    const api = new apigateway.RestApi(this, 'FantasyLineApi', {
      restApiName: 'Fantasy Line API',
    });

    const echoResource = api.root.addResource('echo');
    echoResource.addMethod(
      'ANY',
      new apigateway.LambdaIntegration(echoFunction),
    );
  }
}
