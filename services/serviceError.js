class ServiceError extends Error {
  constructor(message, code = "SERVICE_ERROR", details = {}) {
    super(message)
    this.name = "ServiceError"
    this.code = code
    this.details = details
  }
}

module.exports = ServiceError
