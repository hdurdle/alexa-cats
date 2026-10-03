Throwaway certificates for testing request verification. Not trusted by
anything outside the tests. `leaf.key` signs test request bodies.

- `root.pem`: test trust root
- `chain.pem`: leaf for echo-api.amazon.com + intermediate, chains to root
- `wronghost-chain.pem`: same chain, but the leaf is for example.com
- `rogue-chain.pem`: leaf for echo-api.amazon.com from an untrusted CA
- `extra-cert-chain.pem`: the good chain with an unrelated CA above it, like the
  cross-signed certificates at the top of Amazon's real chain
