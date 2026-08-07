import { Link } from "react-router-dom";

const BUSINESS = "Oficina del Barbero";
const UPDATED = "11 de julio de 2026";

// NOTE: this is a template tailored to what the app actually collects. The
// bracketed [ ... ] fields are the legal identity the business owner must
// fill in. It is not legal advice — have it reviewed before publishing.

function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="legal">
      <div className="legal-inner">
        <Link to="/login" className="legal-back">← Volver</Link>
        <h1>{title}</h1>
        <p className="muted">{BUSINESS} · Última actualización: {UPDATED}</p>
        <div className="legal-note">
          Plantilla orientativa: completa los campos entre corchetes con los datos reales del negocio y
          revísala con un profesional antes de publicarla. No constituye asesoramiento legal.
        </div>
        {children}
        <p className="legal-links">
          <Link to="/privacidad">Política de privacidad</Link> · <Link to="/terminos">Términos del servicio</Link>
        </p>
      </div>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Política de privacidad">
      <h2>1. Responsable del tratamiento</h2>
      <p>
        [Nombre o razón social del negocio], con NIF [NIF], domicilio en [dirección] y correo de contacto
        <b> [email de contacto]</b>, es responsable del tratamiento de los datos personales recogidos a través
        de esta aplicación y del sitio de reservas.
      </p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li><b>Clientes:</b> nombre, teléfono, y correo electrónico. Historial de citas e información de
          asistencia (citas completadas, ausencias y cancelaciones tardías) para la gestión de las reservas.
          Si el negocio activa la tarjeta de fidelización, el número de visitas completadas y los premios
          obtenidos.</li>
        <li><b>Método de pago de cada cita:</b> si has pagado en efectivo o con tarjeta, para la contabilidad
          del negocio. No procesamos ni almacenamos datos de tarjetas bancarias: el pago se realiza
          físicamente en el local, esto es solo una anotación de qué medio usaste.</li>
        <li><b>Notificaciones:</b> si las activas, un identificador (token) de tu dispositivo para enviarte
          recordatorios de tus citas.</li>
        <li><b>Titular del negocio:</b> correo electrónico y credenciales de acceso.</li>
        <li><b>Técnicos:</b> tu sesión iniciada se guarda en el almacenamiento local del navegador
          (localStorage) para no tener que volver a iniciar sesión en cada visita. No usamos cookies de
          publicidad ni de terceros.</li>
      </ul>
      <p>No recogemos datos de tarjetas bancarias ni categorías especiales de datos.</p>

      <h2>3. Finalidad y base jurídica</h2>
      <ul>
        <li><b>Gestionar tus reservas y tu cuenta</b> — ejecución del servicio que solicitas (art. 6.1.b RGPD).</li>
        <li><b>Enviarte recordatorios</b> de tus citas — consentimiento (que puedes retirar desactivando los
          avisos) y/o ejecución del servicio.</li>
        <li><b>Reducir las ausencias</b> mediante indicadores de fiabilidad del cliente — interés legítimo del
          negocio (art. 6.1.f RGPD).</li>
      </ul>

      <h2>4. Conservación</h2>
      <p>
        Conservamos tus datos mientras mantengas la cuenta o exista relación con el negocio. Puedes eliminar tu
        cuenta y tu historial en cualquier momento desde la propia app (Perfil → «Eliminar cuenta»), lo que
        borra tus datos de forma permanente.
      </p>

      <h2>5. Destinatarios y encargados del tratamiento</h2>
      <p>No vendemos ni cedemos tus datos. Nos apoyamos en proveedores que los tratan por cuenta nuestra:</p>
      <ul>
        <li><b>Supabase</b> — base de datos y autenticación (alojamiento en la Unión Europea).</li>
        <li><b>Expo</b> — envío de notificaciones push (puede implicar transferencia a EE. UU. del token del
          dispositivo).</li>
        <li>Si el negocio los activa, proveedores de <b>email o SMS</b> para los recordatorios.</li>
      </ul>

      <h2>6. Tus derechos</h2>
      <p>
        Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad
        escribiendo a <b>[email de contacto]</b>. También puedes eliminar tu cuenta directamente en la app.
        Tienes derecho a reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).
      </p>

      <h2>7. Menores</h2>
      <p>La aplicación no está dirigida a menores de 14 años y no recogemos conscientemente sus datos.</p>

      <h2>8. Seguridad</h2>
      <p>
        Las contraseñas nunca se almacenan en nuestra base de datos: el inicio de sesión lo gestiona
        directamente Supabase Auth, que las guarda cifradas conforme a los estándares del sector. El acceso a
        los datos está restringido por reglas de seguridad a nivel de fila, de modo que cada negocio solo
        accede a su propia información y cada cliente solo ve sus propias citas. La aplicación no carga
        fuentes ni recursos de terceros: todo el contenido se sirve desde nuestro propio dominio.
      </p>

      <h2>9. Cambios</h2>
      <p>
        Podemos actualizar esta política; publicaremos la nueva versión aquí con su fecha de actualización.
      </p>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Términos del servicio">
      <h2>1. Objeto</h2>
      <p>
        Estos términos regulan el uso de la aplicación de reservas de {BUSINESS}, que permite a los clientes
        reservar, consultar y cancelar citas, y al negocio gestionar su agenda.
      </p>

      <h2>2. Cuenta</h2>
      <p>
        Puedes reservar sin cuenta indicando tu nombre y teléfono, o crear una cuenta con tu correo
        electrónico y una contraseña (o mediante un enlace de acceso que te enviamos por email) para consultar
        tu historial de citas y gestionar tus reservas más fácilmente. Eres responsable de la veracidad de tus
        datos y de mantener la confidencialidad de tu contraseña. Puedes eliminar tu cuenta en cualquier
        momento desde la app.
      </p>

      <h2>3. Reservas y cancelaciones</h2>
      <p>
        Las reservas están sujetas a disponibilidad. Te pedimos que canceles con antelación si no puedes
        acudir; las ausencias reiteradas o cancelaciones de última hora pueden reflejarse en tu historial y el
        negocio podría requerir confirmación adicional para futuras citas.
      </p>

      <h2>4. Uso aceptable</h2>
      <p>Te comprometes a no usar la aplicación de forma fraudulenta ni a realizar reservas falsas o abusivas.</p>

      <h2>5. Responsabilidad</h2>
      <p>
        La aplicación se ofrece «tal cual». El negocio no será responsable de interrupciones del servicio
        ajenas a su control. La prestación del servicio de barbería se rige por las condiciones del propio
        negocio.
      </p>

      <h2>6. Legislación aplicable</h2>
      <p>
        Estos términos se rigen por la legislación española. Para cualquier cuestión puedes contactar en
        <b> [email de contacto]</b>.
      </p>
    </LegalShell>
  );
}
