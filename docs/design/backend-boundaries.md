# Backend Boundaries

Domain code contains only business concepts and validation. Application code coordinates use cases through ports. Infrastructure code contains all concrete details for Hermes, local files, queues, and persistence.

The intended dependency direction is:

```txt
interfaces -> application -> domain
infrastructure -> application -> domain
```

Domain never imports infrastructure. Application imports ports and domain only.
