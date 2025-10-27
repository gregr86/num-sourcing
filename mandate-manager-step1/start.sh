#!/bin/bash

# 🚀 Script de démarrage automatique - Mandate Manager
# Usage: ./start.sh [dev|prod|stop|restart|logs]

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/mandate-frontend"

# Couleurs pour l'output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonctions utilitaires
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Vérifier les prérequis
check_prerequisites() {
    log_info "Vérification des prérequis..."
    
    if ! command -v bun &> /dev/null; then
        log_error "Bun n'est pas installé. Installez-le avec: curl -fsSL https://bun.sh/install | bash"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker n'est pas installé."
        exit 1
    fi
    
    if ! command -v docker compose &> /dev/null; then
        log_error "Docker Compose n'est pas installé."
        exit 1
    fi
    
    log_success "Tous les prérequis sont installés"
}

# Démarrer Docker Compose
start_docker() {
    log_info "Démarrage des services Docker (PostgreSQL, MinIO, MailHog)..."
    cd "$PROJECT_ROOT"
    docker compose up -d
    
    log_info "Attente du démarrage de PostgreSQL..."
    sleep 10
    
    # Vérifier que PostgreSQL est prêt
    until docker compose exec -T postgres pg_isready &> /dev/null; do
        log_info "PostgreSQL n'est pas encore prêt, nouvelle tentative dans 2s..."
        sleep 2
    done
    
    log_success "Services Docker démarrés"
}

# Arrêter Docker Compose
stop_docker() {
    log_info "Arrêt des services Docker..."
    cd "$PROJECT_ROOT"
    docker compose down
    log_success "Services Docker arrêtés"
}

# Initialiser la base de données
init_database() {
    log_info "Initialisation de la base de données..."
    cd "$BACKEND_DIR"
    
    if [ ! -f ".env" ]; then
        log_warning "Fichier .env non trouvé, copie depuis .env.example"
        cp .env.example .env
        log_warning "⚠️  Pensez à éditer backend/.env avec vos valeurs !"
    fi
    
    # Générer le client Prisma
    log_info "Génération du client Prisma..."
    bunx prisma generate
    
    # Appliquer les migrations
    log_info "Application des migrations..."
    bunx prisma migrate deploy || bunx prisma migrate dev --name init
    
    # Seed
    log_info "Seed de la base de données..."
    bun run seed
    
    log_success "Base de données initialisée"
}

# Démarrer le backend
start_backend() {
    log_info "Démarrage du backend..."
    cd "$BACKEND_DIR"
    
    if [ ! -d "node_modules" ]; then
        log_info "Installation des dépendances backend..."
        bun install
    fi
    
    if [ "$1" == "dev" ]; then
        log_info "Backend en mode développement sur http://localhost:3001"
        bun run dev &
    else
        log_info "Backend en mode production sur http://localhost:3001"
        bun run start &
    fi
    
    BACKEND_PID=$!
    echo $BACKEND_PID > "$PROJECT_ROOT/.backend.pid"
    
    # Attendre que le backend soit prêt
    log_info "Attente du démarrage du backend..."
    for i in {1..30}; do
        if curl -s http://localhost:3001/health &> /dev/null; then
            log_success "Backend démarré"
            return 0
        fi
        sleep 1
    done
    
    log_warning "Le backend met du temps à démarrer, mais continue..."
}

# Démarrer le frontend
start_frontend() {
    log_info "Démarrage du frontend..."
    cd "$FRONTEND_DIR"
    
    if [ ! -f ".env.local" ]; then
        log_info "Création du fichier .env.local"
        echo "VITE_API_URL=http://localhost:3001" > .env.local
    fi
    
    if [ ! -d "node_modules" ]; then
        log_info "Installation des dépendances frontend..."
        bun install
    fi
    
    log_info "Frontend sur http://localhost:5173"
    bun run dev &
    
    FRONTEND_PID=$!
    echo $FRONTEND_PID > "$PROJECT_ROOT/.frontend.pid"
    
    log_success "Frontend démarré"
}

# Arrêter les processus
stop_processes() {
    log_info "Arrêt des processus backend et frontend..."
    
    if [ -f "$PROJECT_ROOT/.backend.pid" ]; then
        kill $(cat "$PROJECT_ROOT/.backend.pid") 2>/dev/null || true
        rm "$PROJECT_ROOT/.backend.pid"
    fi
    
    if [ -f "$PROJECT_ROOT/.frontend.pid" ]; then
        kill $(cat "$PROJECT_ROOT/.frontend.pid") 2>/dev/null || true
        rm "$PROJECT_ROOT/.frontend.pid"
    fi
    
    # Kill tous les processus bun qui tournent sur les ports
    lsof -ti:3001 | xargs kill -9 2>/dev/null || true
    lsof -ti:5173 | xargs kill -9 2>/dev/null || true
    
    log_success "Processus arrêtés"
}

# Afficher les logs
show_logs() {
    log_info "Affichage des logs Docker..."
    cd "$PROJECT_ROOT"
    docker compose logs -f
}

# Afficher le status
show_status() {
    log_info "Status des services:"
    echo ""
    
    # Docker
    cd "$PROJECT_ROOT"
    if docker compose ps | grep -q "Up"; then
        log_success "Docker services: Running"
        docker compose ps
    else
        log_warning "Docker services: Stopped"
    fi
    
    echo ""
    
    # Backend
    if curl -s http://localhost:3001/health &> /dev/null; then
        log_success "Backend: Running (http://localhost:3001)"
    else
        log_warning "Backend: Stopped"
    fi
    
    # Frontend
    if curl -s http://localhost:5173 &> /dev/null; then
        log_success "Frontend: Running (http://localhost:5173)"
    else
        log_warning "Frontend: Stopped"
    fi
    
    echo ""
    log_info "Services disponibles:"
    echo "  - Frontend:      http://localhost:5173"
    echo "  - Backend API:   http://localhost:3001"
    echo "  - MinIO Console: http://localhost:9001 (admin/adminpass)"
    echo "  - MailHog UI:    http://localhost:8025"
}

# Menu principal
case "${1:-dev}" in
    dev|development)
        log_info "🚀 Démarrage en mode DÉVELOPPEMENT"
        check_prerequisites
        start_docker
        init_database
        start_backend dev
        start_frontend
        echo ""
        log_success "✅ Application démarrée !"
        show_status
        echo ""
        log_info "Pour arrêter: ./start.sh stop"
        log_info "Pour voir les logs: ./start.sh logs"
        ;;
        
    prod|production)
        log_info "🚀 Démarrage en mode PRODUCTION"
        check_prerequisites
        start_docker
        init_database
        start_backend prod
        
        # En prod, on build le frontend au lieu de le servir
        cd "$FRONTEND_DIR"
        log_info "Build du frontend..."
        bun run build
        log_success "Frontend buildé dans mandate-frontend/dist"
        
        show_status
        ;;
        
    stop)
        log_info "🛑 Arrêt de l'application"
        stop_processes
        stop_docker
        log_success "Application arrêtée"
        ;;
        
    restart)
        log_info "♻️  Redémarrage de l'application"
        stop_processes
        start_backend dev
        start_frontend
        log_success "Application redémarrée"
        ;;
        
    logs)
        show_logs
        ;;
        
    status)
        show_status
        ;;
        
    clean)
        log_warning "🧹 Nettoyage complet (supprime les données !)"
        read -p "Êtes-vous sûr ? (yes/no): " -n 3 -r
        echo
        if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            stop_processes
            cd "$PROJECT_ROOT"
            docker compose down -v
            rm -f .backend.pid .frontend.pid
            log_success "Nettoyage terminé"
        else
            log_info "Annulé"
        fi
        ;;
        
    *)
        echo "Usage: $0 {dev|prod|stop|restart|logs|status|clean}"
        echo ""
        echo "Commandes:"
        echo "  dev       - Démarrer en mode développement (défaut)"
        echo "  prod      - Démarrer en mode production"
        echo "  stop      - Arrêter tous les services"
        echo "  restart   - Redémarrer backend et frontend"
        echo "  logs      - Afficher les logs Docker"
        echo "  status    - Afficher le status des services"
        echo "  clean     - Nettoyage complet (⚠️ supprime les données)"
        exit 1
        ;;
esac
