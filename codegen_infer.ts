import { TheCodegenConfiguration } from '@the-codegen-project/cli';
const config: TheCodegenConfiguration = {
  inputType: "asyncapi",
  inputPath: "../../eventcatalog/asyncapi-files/orders-service.yml",
  language: "typescript",
  generators: [
    {
      preset: "channels",
      outputPath: "src/__gen__/channels",
    }
  ]
};
export default config;