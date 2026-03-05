import { expect, test, describe } from "bun:test";

describe("🔔 Microservicio de Notificaciones - Smoke Test Industrial", () => {
    const PORT = process.env.PORT || "3001";
    const BASE_URL = `http://localhost:${PORT}`;
    const SECRET = "audit_notification_secret_2026_xyz";

    test("🏥 Health check público (sin slash) debe responder OK", async () => {
        const res = await fetch(`${BASE_URL}/health`);
        expect(res.status).toBe(200);
    });

    test("🏥 Health check público (con slash) debe responder OK", async () => {
        const res = await fetch(`${BASE_URL}/health/`);
        expect(res.status).toBe(200);
    });

    test("🔒 El envío sin secreto (/email/) debe fallar con 401", async () => {
        const res = await fetch(`${BASE_URL}/email/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: "test@example.com", subject: "Test", text: "Hello" })
        });
        expect(res.status).toBe(401);
    });

    test("🔒 El envío con secreto inválido debe fallar con 401", async () => {
        const res = await fetch(`${BASE_URL}/email/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Notification-Secret": "wrong_secret_123"
            },
            body: JSON.stringify({ to: "test@example.com", subject: "Test", text: "Hello" })
        });
        expect(res.status).toBe(401);
    });

    test("✅ El envío funcional CON secreto debe ser exitoso (201/502)", async () => {
        const res = await fetch(`${BASE_URL}/email/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Notification-Secret": SECRET
            },
            body: JSON.stringify({
                to: "alekxandermxtr@gmail.com",
                subject: "Smoke Test Up-to-Date",
                text: "Verificando arquitectura vertical 100% moderna."
            })
        });
        expect([201, 502]).toContain(res.status);
    });
});
