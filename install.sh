#!/bin/bash

# WhatsApp AI - One-line installer for macOS
# Usage: curl -fsSL https://raw.githubusercontent.com/Jan-ebb/whatsapp-ai/main/install.sh | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Install location
INSTALL_DIR="$HOME/.whatsapp-ai"
REPO_URL="https://github.com/Jan-ebb/whatsapp-ai.git"

print_banner() {
    echo ""
    echo -e "${BOLD}${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${GREEN}║       WhatsApp AI Installer            ║${NC}"
    echo -e "${BOLD}${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${CYAN}→${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check macOS
check_macos() {
    if [[ "$(uname)" != "Darwin" ]]; then
        print_error "This installer is for macOS only"
        echo "For other platforms, please install manually:"
        echo "  git clone $REPO_URL"
        echo "  cd whatsapp-ai && ./setup.sh"
        exit 1
    fi
}

# Install Homebrew if needed
install_homebrew() {
    if ! command_exists brew; then
        print_step "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        
        # Add to path for Apple Silicon
        if [[ -f "/opt/homebrew/bin/brew" ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi
        print_success "Homebrew installed"
    else
        print_success "Homebrew already installed"
    fi
}

# Install Node.js if needed
install_node() {
    if ! command_exists node; then
        print_step "Installing Node.js..."
        brew install node@20
        print_success "Node.js installed"
    else
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 20 ]; then
            print_step "Upgrading Node.js to v20..."
            brew install node@20
            print_success "Node.js upgraded"
        else
            print_success "Node.js v$(node -v | cut -d'v' -f2) already installed"
        fi
    fi
}

# Install Ollama if needed
install_ollama() {
    if ! command_exists ollama; then
        print_step "Installing Ollama (for AI-powered search)..."
        brew install ollama
        print_success "Ollama installed"
    else
        print_success "Ollama already installed"
    fi
}

# Pull embedding model
setup_ollama() {
    print_step "Setting up AI embedding model..."
    
    # Start Ollama if not running
    if ! pgrep -x "ollama" > /dev/null; then
        ollama serve &>/dev/null &
        sleep 2
    fi
    
    # Pull model if not present
    if ! ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
        print_step "Downloading nomic-embed-text model (this may take a minute)..."
        ollama pull nomic-embed-text
    fi
    
    print_success "AI model ready"
}

# Clone or update repository
setup_repo() {
    if [ -d "$INSTALL_DIR" ]; then
        print_step "Updating WhatsApp AI..."
        cd "$INSTALL_DIR"
        git pull --quiet
    else
        print_step "Downloading WhatsApp AI..."
        git clone --quiet "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
    print_success "Repository ready"
}

# Install dependencies and build
build_project() {
    cd "$INSTALL_DIR"
    
    print_step "Installing dependencies..."
    npm install --silent 2>/dev/null
    print_success "Dependencies installed"
    
    print_step "Building..."
    npm run build --silent 2>/dev/null
    print_success "Build complete"
}

# Configure passphrase
setup_passphrase() {
    echo ""
    echo -e "${BOLD}Configuration${NC}"
    echo -e "${DIM}The passphrase encrypts your WhatsApp credentials and messages.${NC}"
    echo -e "${DIM}Choose something memorable - you'll need it if you restart.${NC}"
    echo ""

    while true; do
        read -sp "Enter passphrase (min 8 characters): " PASSPHRASE
        echo ""
        
        if [ ${#PASSPHRASE} -lt 8 ]; then
            print_error "Passphrase must be at least 8 characters"
            continue
        fi

        read -sp "Confirm passphrase: " PASSPHRASE_CONFIRM
        echo ""

        if [ "$PASSPHRASE" != "$PASSPHRASE_CONFIRM" ]; then
            print_error "Passphrases don't match"
            continue
        fi

        break
    done

    # Save to .env
    cat > "$INSTALL_DIR/.env" << EOF
# WhatsApp AI Configuration
WHATSAPP_PASSPHRASE=$PASSPHRASE
EOF
    chmod 600 "$INSTALL_DIR/.env"
    print_success "Configuration saved"
}

# Add WhatsApp to an MCP config file
add_to_mcp_config() {
    local CONFIG_FILE="$1"
    local CONFIG_NAME="$2"
    
    # Create directory if needed
    mkdir -p "$(dirname "$CONFIG_FILE")"
    
    # Create or update config
    if [ -f "$CONFIG_FILE" ]; then
        # Backup existing config
        cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
        
        # Check if whatsapp already configured
        if grep -q '"whatsapp"' "$CONFIG_FILE"; then
            print_warn "WhatsApp already configured in $CONFIG_NAME"
            return 1
        else
            # Add to existing config using Python (available on macOS)
            python3 << EOF
import json

with open("$CONFIG_FILE", "r") as f:
    config = json.load(f)

if "mcpServers" not in config:
    config["mcpServers"] = {}

config["mcpServers"]["whatsapp"] = {
    "command": "node",
    "args": ["$INSTALL_DIR/dist/index.js"],
    "env": {
        "WHATSAPP_PASSPHRASE": "$PASSPHRASE"
    }
}

with open("$CONFIG_FILE", "w") as f:
    json.dump(config, f, indent=2)
EOF
            print_success "Added WhatsApp to $CONFIG_NAME"
            return 0
        fi
    else
        # Create new config
        cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["$INSTALL_DIR/dist/index.js"],
      "env": {
        "WHATSAPP_PASSPHRASE": "$PASSPHRASE"
      }
    }
  }
}
EOF
        print_success "Created $CONFIG_NAME config"
        return 0
    fi
}

# Configure Claude clients
configure_claude() {
    # Config file locations
    CLAUDE_DESKTOP_DIR="$HOME/Library/Application Support/Claude"
    CLAUDE_DESKTOP_CONFIG="$CLAUDE_DESKTOP_DIR/claude_desktop_config.json"
    
    CLAUDE_CODE_DIR="$HOME/.claude"
    CLAUDE_CODE_CONFIG="$CLAUDE_CODE_DIR/mcp.json"
    
    echo ""
    echo -e "${BOLD}Which Claude client do you want to configure?${NC}"
    echo ""
    echo "  1) Claude Desktop"
    echo "  2) Claude Code (CLI)"
    echo "  3) Both"
    echo "  4) Skip (configure manually later)"
    echo ""
    read -p "Choice [1-4]: " -n 1 -r CHOICE
    echo ""
    
    case $CHOICE in
        1)
            print_step "Configuring Claude Desktop..."
            add_to_mcp_config "$CLAUDE_DESKTOP_CONFIG" "Claude Desktop"
            ;;
        2)
            print_step "Configuring Claude Code..."
            add_to_mcp_config "$CLAUDE_CODE_CONFIG" "Claude Code"
            ;;
        3)
            print_step "Configuring Claude Desktop..."
            add_to_mcp_config "$CLAUDE_DESKTOP_CONFIG" "Claude Desktop"
            print_step "Configuring Claude Code..."
            add_to_mcp_config "$CLAUDE_CODE_CONFIG" "Claude Code"
            ;;
        4|*)
            print_warn "Skipping automatic configuration"
            echo ""
            echo "To configure manually, add this to your MCP config:"
            echo ""
            echo -e "${DIM}Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json${NC}"
            echo -e "${DIM}Claude Code:    ~/.claude/mcp.json${NC}"
            echo ""
            echo '  "whatsapp": {'
            echo '    "command": "node",'
            echo "    \"args\": [\"$INSTALL_DIR/dist/index.js\"],"
            echo '    "env": {'
            echo "      \"WHATSAPP_PASSPHRASE\": \"$PASSPHRASE\""
            echo '    }'
            echo '  }'
            ;;
    esac
}

# Print completion message
print_complete() {
    echo ""
    echo -e "${BOLD}${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${GREEN}║       Installation Complete!           ║${NC}"
    echo -e "${BOLD}${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BOLD}Next steps:${NC}"
    echo ""
    echo "  1. Restart your Claude client (Desktop or Code)"
    echo ""
    echo "  2. Ask Claude to connect to WhatsApp:"
    echo -e "     ${DIM}\"Connect to my WhatsApp\"${NC}"
    echo ""
    echo "  3. Scan the QR code with your phone:"
    echo -e "     ${DIM}WhatsApp → Settings → Linked Devices → Link a Device${NC}"
    echo ""
    echo "  4. Start chatting!"
    echo -e "     ${DIM}\"Search my WhatsApp for messages about the project\"${NC}"
    echo -e "     ${DIM}\"Send 'Running late!' to John\"${NC}"
    echo ""
    echo -e "${DIM}Installation directory: $INSTALL_DIR${NC}"
    echo ""
}

# Main installation
main() {
    print_banner
    
    check_macos
    install_homebrew
    install_node
    install_ollama
    setup_ollama
    setup_repo
    build_project
    setup_passphrase
    configure_claude
    print_complete
}

main "$@"
