/**
 * Stable, machine-readable error identifiers returned by the API.
 *
 * The spec is explicit that clients must branch on `code` and never on
 * `message` — the message is documented as English prose "intended for logs
 * and developers", so it is a developer diagnostic, not user-facing copy.
 * That is why every code the backoffice can provoke gets Spanish copy here.
 */
export const API_ERROR_CODES = [
  'SHIFT_ALREADY_OPEN',
  'SHIFT_REQUIRED',
  'SHIFT_ALREADY_CLOSED',
  'SHIFT_RETURN_PENDING',
  'SHIFT_RETURN_DECLARED',
  'SHIFT_NOT_FOUND',
  'SHIFT_ROUTE_INVALID',
  'DISPATCH_NOT_ASSIGNED',
  'DISPATCH_INVALID_STATE',
  'DISPATCH_NOT_YOURS',
  'DISPATCH_NOT_FOUND',
  'CANCEL_REASON_REQUIRED',
  'DISPATCH_ORDER_NUMBER_TAKEN',
  'CASH_SESSION_ALREADY_OPEN',
  'CASH_SESSION_REQUIRED',
  'CASH_SESSION_ALREADY_CLOSED',
  'CASH_SESSION_NOT_FOUND',
  'SALE_CLIENT_REQUIRED',
  'SALE_ALREADY_PAID',
  'PAYMENT_ON_NON_CREDIT_SALE',
  'PAYMENT_EXCEEDS_BALANCE',
  'SALE_NOT_FOUND',
  'INSUFFICIENT_STOCK',
  'RETURN_NOT_DRAFT',
  'RETURN_NOT_FOUND',
  'RETURN_ALREADY_DECLARED',
  'RETURN_NOTHING_TO_RECONCILE',
  'RETURN_SETTLES_CLOSED_SHIFT',
  'SALES_ORDER_NOT_FOUND',
  'SALES_ORDER_EMPTY',
  'SALES_ORDER_INVALID_STATE',
  'SALES_ORDER_CLOSED',
  'SALES_ORDER_OVER_FULFILLED',
  'SALES_ORDER_CLIENT_MISMATCH',
  'SALES_ORDER_LINE_BELOW_FULFILLED',
  'CLIENT_NOT_FOUND',
  'CLIENT_REASSIGN_FORBIDDEN',
  'ROUTE_NOT_FOUND',
  'ROUTE_SELLER_FORBIDDEN',
  'ROUTE_STATUS_TRANSITION_INVALID',
  'ROUTE_STOP_STATUS_TRANSITION_INVALID',
  'ROUTE_CLOSED',
  'ROUTE_STOP_ORDER_INVALID',
  'IDEMPOTENCY_IN_PROGRESS',
  'IDEMPOTENCY_KEY_REUSED',
  'VALIDATION_FAILED',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'REQUEST_TIMEOUT',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

const CODES: ReadonlySet<string> = new Set(API_ERROR_CODES);

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && CODES.has(value);
}

/**
 * User-facing Spanish copy per code.
 *
 * Written for the person on the other side of the screen: what happened and
 * what to do about it, never the internal rule that was violated. Codes with
 * no entry fall back to the API's own message, which is at least accurate.
 */
export const API_ERROR_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  // Shifts
  SHIFT_ALREADY_OPEN: 'Este vendedor ya tiene una jornada abierta.',
  SHIFT_REQUIRED: 'La operación necesita una jornada abierta.',
  SHIFT_ALREADY_CLOSED: 'Esta jornada ya fue cerrada.',
  SHIFT_RETURN_PENDING:
    'La jornada salió con carga y el retorno de mercadería todavía no fue confirmado. Confirmá el retorno antes de cerrarla.',
  SHIFT_RETURN_DECLARED:
    'El retorno de esta jornada ya fue declarado y está esperando verificación en bodega.',
  SHIFT_NOT_FOUND: 'No se encontró la jornada.',
  SHIFT_ROUTE_INVALID: 'La ruta indicada no es válida para esta jornada.',

  // Dispatches
  DISPATCH_NOT_ASSIGNED: 'El despacho todavía no fue asignado.',
  DISPATCH_INVALID_STATE: 'El despacho no está en un estado que permita esta acción.',
  DISPATCH_NOT_YOURS: 'Este despacho pertenece a otro vendedor.',
  DISPATCH_NOT_FOUND: 'No se encontró el despacho.',
  CANCEL_REASON_REQUIRED: 'Indicá el motivo de la cancelación.',
  DISPATCH_ORDER_NUMBER_TAKEN:
    'Ese número de orden ya fue usado en otro despacho. Revisá el número antes de guardar.',

  // Cash sessions
  CASH_SESSION_ALREADY_OPEN: 'Ya hay una caja abierta.',
  CASH_SESSION_REQUIRED: 'La operación necesita una caja abierta.',
  CASH_SESSION_ALREADY_CLOSED: 'Esta caja ya fue cerrada.',
  CASH_SESSION_NOT_FOUND: 'No se encontró la caja.',

  // Sales and payments
  SALE_CLIENT_REQUIRED: 'Esta venta necesita un cliente registrado.',
  SALE_ALREADY_PAID: 'Esta venta ya está saldada.',
  PAYMENT_ON_NON_CREDIT_SALE: 'Solo se pueden registrar abonos sobre ventas al crédito.',
  PAYMENT_EXCEEDS_BALANCE: 'El abono supera el saldo pendiente de la venta.',
  SALE_NOT_FOUND: 'No se encontró la venta.',
  INSUFFICIENT_STOCK: 'No hay existencias suficientes para completar la operación.',

  // Returns
  RETURN_NOT_DRAFT: 'Este retorno ya no es un borrador.',
  RETURN_NOT_FOUND: 'No se encontró el retorno.',
  RETURN_ALREADY_DECLARED: 'Este retorno ya fue declarado por el vendedor.',
  RETURN_NOTHING_TO_RECONCILE: 'No hay diferencias que conciliar en este retorno.',
  RETURN_SETTLES_CLOSED_SHIFT:
    'La jornada de este retorno ya fue cerrada y no admite ajustes.',

  // Sales orders (preventa)
  SALES_ORDER_NOT_FOUND: 'No se encontró el pedido.',
  SALES_ORDER_EMPTY: 'El pedido no tiene productos. Agregá al menos uno antes de enviarlo.',
  SALES_ORDER_INVALID_STATE: 'El pedido no está en un estado que permita esta acción.',
  SALES_ORDER_CLOSED:
    'Este pedido ya está cerrado: los pedidos entregados o cancelados no se pueden modificar.',
  SALES_ORDER_OVER_FULFILLED: 'La venta cubre más de lo que el pedido todavía debe.',
  SALES_ORDER_CLIENT_MISMATCH: 'El pedido pertenece a otro cliente.',
  SALES_ORDER_LINE_BELOW_FULFILLED:
    'No podés reducir ni quitar una línea por debajo de lo ya entregado al cliente.',

  // Clients and routes
  CLIENT_NOT_FOUND: 'No se encontró el cliente.',
  CLIENT_REASSIGN_FORBIDDEN: 'No tenés permiso para reasignar este cliente.',
  ROUTE_NOT_FOUND: 'No se encontró la ruta.',
  ROUTE_SELLER_FORBIDDEN: 'Esta ruta pertenece a otro vendedor.',
  ROUTE_STATUS_TRANSITION_INVALID: 'La ruta no puede pasar a ese estado.',
  ROUTE_STOP_STATUS_TRANSITION_INVALID: 'La parada no puede pasar a ese estado.',
  ROUTE_CLOSED: 'La ruta ya está cerrada.',
  ROUTE_STOP_ORDER_INVALID: 'El orden de las paradas no es válido.',

  // Idempotency. Both mean "your request was not lost" — the worst possible
  // reaction is the user retrying by hand and double-charging someone.
  IDEMPOTENCY_IN_PROGRESS:
    'La operación anterior todavía se está procesando. Esperá unos segundos y volvé a intentar.',
  IDEMPOTENCY_KEY_REUSED:
    'Se reintentó la operación con datos distintos. Revisá los valores y volvé a enviarla.',

  // Generic
  VALIDATION_FAILED: 'Revisá los datos ingresados.',
  BAD_REQUEST: 'La solicitud no es válida.',
  UNAUTHORIZED: 'Tu sesión expiró. Iniciá sesión de nuevo.',
  FORBIDDEN: 'No tenés permiso para realizar esta acción.',
  NOT_FOUND: 'No se encontró el recurso solicitado.',
  CONFLICT: 'La operación no se puede completar en este momento.',
  REQUEST_TIMEOUT: 'La solicitud tardó demasiado. Volvé a intentar.',
  INTERNAL_ERROR: 'Ocurrió un error en el servidor. Volvé a intentar en unos minutos.',
};
