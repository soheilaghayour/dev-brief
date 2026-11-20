/** Runs `work` over `inputs` with at most `concurrency` calls in flight; outputs keep the input order. */
export async function mapWithConcurrency<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  work: (input: Input) => Promise<Output>,
) {
  const outputs: Output[] = [];
  let next = 0;
  const worker = async () => {
    while (next < inputs.length) {
      const index = next++;
      outputs[index] = await work(inputs[index] as Input);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
  return outputs;
}
