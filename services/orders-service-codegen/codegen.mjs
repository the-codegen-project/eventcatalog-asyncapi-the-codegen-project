/** @type {import("@the-codegen-project/cli").TheCodegenConfiguration} **/
export default {
  inputType: "asyncapi",
  inputPath: "../../eventcatalog/asyncapi-files/orders-service.yml",
  language: "typescript",
  generators: [
    {
      preset: "channels",
      outputPath: "src/__gen__/channels",
      protocols: ["nats"],
      asyncapiReverseOperations: false,
      asyncapiGenerateForOperations: true,
    }
  ]
};