export class ExportPendingError extends Error {
  readonly code = 'export-pending'

  constructor() {
    super('An export is already queued or running for this scope.')
    this.name = 'ExportPendingError'
  }
}

export class ExportAlreadyRunningError extends Error {
  constructor() {
    super('An export task for this job is already running.')
    this.name = 'ExportAlreadyRunningError'
  }
}

export class AccountConfirmationError extends Error {
  readonly code = 'confirmation-mismatch'

  constructor() {
    super('The typed email does not match this account.')
    this.name = 'AccountConfirmationError'
  }
}

export class SoleOwnerError extends Error {
  readonly code = 'sole-owner'

  constructor(readonly organisations: Array<{ id: string; slug: string; name: string }>) {
    super('This account is the only Owner of one or more organisations.')
    this.name = 'SoleOwnerError'
  }
}

export class OrganisationNotFoundError extends Error {
  constructor() {
    super('The organisation was not found.')
    this.name = 'OrganisationNotFoundError'
  }
}

export class OrganisationConfirmationError extends Error {
  constructor() {
    super('The typed organisation slug does not match.')
    this.name = 'OrganisationConfirmationError'
  }
}

export class OrganisationDeletionExpiredError extends Error {
  constructor() {
    super('The organisation deletion grace period has ended.')
    this.name = 'OrganisationDeletionExpiredError'
  }
}

export class AccountNotFoundError extends Error {
  constructor() {
    super('The account was not found.')
    this.name = 'AccountNotFoundError'
  }
}
