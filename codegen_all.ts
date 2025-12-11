import { TheCodegenConfiguration } from '@the-codegen-project/cli';
const config: TheCodegenConfiguration = {
  inputType: "asyncapi",
  inputPath: "../../eventcatalog/asyncapi-files/orders-service.yml",
  language: "typescript",
  generators: [
    {
      preset: "types",
      outputPath: "src/__gen__/types"
    },
    {
      preset: "payloads",
      outputPath: "src/__gen__/payloads"
    },
    {
      preset: "headers",
      outputPath: "src/__gen__/headers"
    },
    {
      preset: "parameters",
      outputPath: "src/__gen__/parameters"
    },
    {
      preset: "channels",
      outputPath: "src/__gen__/channels",
    }
  ]
};
export default config;