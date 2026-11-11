CREATE TABLE "archivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"mime" text NOT NULL,
	"tamano" integer NOT NULL,
	"es_foto" boolean DEFAULT false NOT NULL,
	"datos" "bytea" NOT NULL,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"whatsapp" text,
	"email" text,
	"interes" text,
	"presupuesto" numeric(14, 2),
	"presupuesto_moneda" text DEFAULT 'USD' NOT NULL,
	"estado" text DEFAULT 'nuevo' NOT NULL,
	"ultima_conversacion" date,
	"proximo_seguimiento" date,
	"notas" text,
	"borrado_el" timestamp with time zone,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "envios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"clave" text NOT NULL,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"sin_hora" boolean DEFAULT false NOT NULL,
	"duracion_min" integer DEFAULT 60 NOT NULL,
	"persona" text,
	"lugar" text,
	"notas" text,
	"cliente_id" uuid,
	"completado_el" timestamp with time zone,
	"borrado_el" timestamp with time zone,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gastos_obra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"obra_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"concepto" text NOT NULL,
	"proveedor" text,
	"importe" numeric(14, 2) NOT NULL,
	"moneda" text DEFAULT 'ARS' NOT NULL,
	"categoria" text DEFAULT 'Materiales' NOT NULL,
	"pagado" boolean DEFAULT true NOT NULL,
	"tipo_cambio" numeric(14, 4),
	"tipo_cambio_fecha" date,
	"borrado_el" timestamp with time zone,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inmuebles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text,
	"tipo" text DEFAULT 'Casa' NOT NULL,
	"precio" numeric(14, 2),
	"moneda" text DEFAULT 'USD' NOT NULL,
	"superficie" numeric(12, 2),
	"propietario" text,
	"estado" text DEFAULT 'disponible' NOT NULL,
	"observaciones" text,
	"borrado_el" timestamp with time zone,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intereses" (
	"cliente_id" uuid NOT NULL,
	"inmueble_id" uuid NOT NULL,
	CONSTRAINT "intereses_cliente_id_inmueble_id_pk" PRIMARY KEY("cliente_id","inmueble_id")
);
--> statement-breakpoint
CREATE TABLE "obras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"direccion" text,
	"presupuesto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"moneda" text DEFAULT 'ARS' NOT NULL,
	"estado" text DEFAULT 'activa' NOT NULL,
	"notas" text,
	"borrado_el" timestamp with time zone,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" text DEFAULT 'personal' NOT NULL,
	"concepto" text NOT NULL,
	"categoria" text NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"moneda" text DEFAULT 'ARS' NOT NULL,
	"vence" date NOT NULL,
	"pagado_el" date,
	"medio_pago" text,
	"proveedor" text,
	"periodo" text,
	"notas" text,
	"repite" text DEFAULT 'no' NOT NULL,
	"serie_id" uuid,
	"borrado_el" timestamp with time zone,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recuperaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira" timestamp with time zone NOT NULL,
	"usado_el" timestamp with time zone,
	CONSTRAINT "recuperaciones_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "registro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" uuid,
	"resumen" text NOT NULL,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nombre" text NOT NULL,
	"clave_hash" text NOT NULL,
	"rol" text DEFAULT 'dueno' NOT NULL,
	"prefs" jsonb DEFAULT '{"diasAnticipacion":5,"avisos":{"impuestos":true,"pagos":true,"seguimientos":true,"obras":true,"duplicados":true},"correo":{"diario":true,"semanal":true,"copia":false}}'::jsonb NOT NULL,
	"token_calendario" text NOT NULL,
	"version_sesion" integer DEFAULT 1 NOT NULL,
	"intentos_fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email"),
	CONSTRAINT "usuarios_token_calendario_unique" UNIQUE("token_calendario")
);
--> statement-breakpoint
CREATE TABLE "visitas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"inmueble_id" uuid NOT NULL,
	"cliente_id" uuid,
	"tipo" text DEFAULT 'visita' NOT NULL,
	"fecha" date NOT NULL,
	"notas" text,
	"borrado_el" timestamp with time zone,
	"creado_el" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "archivos" ADD CONSTRAINT "archivos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "envios" ADD CONSTRAINT "envios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos_obra" ADD CONSTRAINT "gastos_obra_obra_id_obras_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inmuebles" ADD CONSTRAINT "inmuebles_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intereses" ADD CONSTRAINT "intereses_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intereses" ADD CONSTRAINT "intereses_inmueble_id_inmuebles_id_fk" FOREIGN KEY ("inmueble_id") REFERENCES "public"."inmuebles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obras" ADD CONSTRAINT "obras_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recuperaciones" ADD CONSTRAINT "recuperaciones_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registro" ADD CONSTRAINT "registro_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_inmueble_id_inmuebles_id_fk" FOREIGN KEY ("inmueble_id") REFERENCES "public"."inmuebles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "archivos_entidad" ON "archivos" USING btree ("entidad","entidad_id");--> statement-breakpoint
CREATE INDEX "clientes_usuario" ON "clientes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "envios_clave" ON "envios" USING btree ("usuario_id","clave");--> statement-breakpoint
CREATE INDEX "eventos_usuario_inicio" ON "eventos" USING btree ("usuario_id","inicio");--> statement-breakpoint
CREATE INDEX "gastos_obra_obra" ON "gastos_obra" USING btree ("obra_id","fecha");--> statement-breakpoint
CREATE INDEX "inmuebles_usuario" ON "inmuebles" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "obras_usuario" ON "obras" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "pagos_usuario_vence" ON "pagos" USING btree ("usuario_id","vence");--> statement-breakpoint
CREATE INDEX "pagos_serie" ON "pagos" USING btree ("serie_id");--> statement-breakpoint
CREATE INDEX "registro_usuario" ON "registro" USING btree ("usuario_id","creado_el");--> statement-breakpoint
CREATE INDEX "visitas_inmueble" ON "visitas" USING btree ("inmueble_id");