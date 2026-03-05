export class DomainException extends Error {
    constructor(
        public title: string,
        public status: number,
        public detail: string,
        public type: string = 'https://coworking.api/errors/general'
    ) {
        super(detail);
        this.name = 'DomainException';
    }
}

export class UnauthorizedException extends DomainException {
    constructor(detail: string = 'Inicia sesión para poder continuar.') {
        super('Todavía no sabemos quién eres', 401, detail, 'https://coworking.api/errors/unauthorized');
    }
}

export class ForbiddenException extends DomainException {
    constructor(detail: string = 'No tienes los permisos para realizar esta acción.') {
        super('No tienes permiso para entrar aquí', 403, detail, 'https://coworking.api/errors/forbidden');
    }
}

export class NotFoundException extends DomainException {
    constructor(detail: string = 'No pudimos encontrar lo que buscabas.') {
        super('No encontramos ese recurso', 404, detail, 'https://coworking.api/errors/not-found');
    }
}

export class ConflictException extends DomainException {
    constructor(detail: string) {
        super('Hay un problema con tu solicitud', 409, detail, 'https://coworking.api/errors/conflict');
    }
}

export class RateLimitException extends DomainException {
    constructor(detail: string = 'Estás haciendo demasiadas peticiones. Por favor, espera un momento.') {
        super('Estás pidiendo demasiado rápido', 429, detail, 'https://coworking.api/errors/rate-limit');
    }
}

export class ValidationException extends DomainException {
    constructor(detail: string) {
        super('Hay campos con errores', 422, detail, 'https://coworking.api/errors/validation');
    }
}
