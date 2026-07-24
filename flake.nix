{
  description = "Cloudflare Worker — GitHub webhook → Discord Gateway";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            nodejs_22
            biome
            nixfmt
          ];

          shellHook = ''
            echo "WebHooker devShell 已加载"
          '';
        };

        formatter = nixpkgs.legacyPackages.${system}.nixfmt;
      });
}
