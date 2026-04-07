.PHONY: build watch clean install

# Build XPI package
build:
	@bash build.sh

# Watch for changes and rebuild
watch:
	@bash watch.sh

# Clean build artifacts
clean:
	@rm -rf dist/
	@echo "Cleaned dist directory"

# Install dependencies (if any)
install:
	@echo "No dependencies required"

# Help
help:
	@echo "Available targets:"
	@echo "  make build  - Build XPI package"
	@echo "  make watch  - Watch for changes and auto-rebuild"
	@echo "  make clean  - Remove build artifacts"
	@echo "  make help   - Show this help"



