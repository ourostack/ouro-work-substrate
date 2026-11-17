@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Short environment name. Used in resource names.')
@minLength(2)
@maxLength(16)
param environmentName string = 'prod'

@description('Azure Container Registry name. Must be globally unique.')
param containerRegistryName string = toLower(replace('ourowork${environmentName}${uniqueString(subscription().id, resourceGroup().id)}', '-', ''))

@description('Container image for apps/mail-ingress.')
param mailIngressImage string

@description('Container image for apps/mail-control.')
param mailControlImage string

@description('Container image for apps/vault-control.')
param vaultControlImage string

@description('Container image for apps/trip-control. Empty skips the trip-control app (it has no image build in Deploy Azure yet).')
param tripControlImage string = ''

@description('Bearer token for trip-control.')
@secure()
param tripControlAdminToken string = ''

@description('Trip ledger storage container name.')
param tripContainerName string = 'trips'

@description('Vaultwarden/Bitwarden server URL used by vault-control.')
param vaultServerUrl string = 'https://vault.ouro.bot'

@description('Bearer token for mail-control.')
@secure()
param mailControlAdminToken string

@description('Bearer token for vault-control.')
@secure()
param vaultControlAdminToken string

@description('Mail domain served by the hosted substrate.')
param mailDomain string = 'ouro.bot'

@description('Mail storage container name.')
param mailContainerName string = 'mailroom'

@description('Mail registry blob name.')
param mailRegistryBlob string = 'registry/mailroom.json'

@description('Data residency location for Azure Communication Services outbound email.')
param outboundEmailDataLocation string = 'United States'

@description('Whether the ACS Communication Services resource should link the custom email domain. Leave false until DNS records are verified.')
param outboundEmailLinkVerifiedDomain bool = false

@description('Whether the ACS custom email domain already exists and should be treated as an existing resource to preserve verification state.')
param outboundEmailDomainExists bool = false

@description('Virtual network address prefix for the Container Apps environment.')
param virtualNetworkAddressPrefix string = '10.42.0.0/16'

@description('Delegated infrastructure subnet prefix for the workload profiles Container Apps environment.')
param infrastructureSubnetPrefix string = '10.42.0.0/27'

@description('Health HTTP port exposed by mail ingress.')
param mailHttpPort int = 8080

@description('SMTP port listened to by mail ingress.')
param mailSmtpPort int = 2525

@description('Externally exposed SMTP TCP port. Production MX uses 25; use nonstandard ports only for diagnostics.')
param mailExposedSmtpPort int = 25

@description('Minimum mail ingress replicas. Keep at least one for SMTP responsiveness.')
@minValue(1)
param mailIngressMinReplicas int = 1

@description('Maximum mail ingress replicas.')
@minValue(1)
param mailIngressMaxReplicas int = 5

@description('Maximum accepted recipients in one SMTP transaction.')
@minValue(1)
param mailIngressMaxRecipients int = 100

@description('Maximum concurrent SMTP clients accepted by one mail-ingress replica.')
@minValue(1)
param mailIngressMaxConnections int = 100

@description('Maximum SMTP connection attempts from one remote address inside the rate-limit window.')
@minValue(1)
param mailIngressConnectionRateLimitMax int = 120

@description('SMTP connection rate-limit window in milliseconds.')
@minValue(1)
param mailIngressConnectionRateLimitWindowMs int = 60000

@description('PEM TLS private key used by mail-ingress STARTTLS. Leave empty to keep STARTTLS disabled.')
@secure()
param mailIngressTlsKey string = ''

@description('PEM TLS certificate chain used by mail-ingress STARTTLS. Leave empty to keep STARTTLS disabled.')
@secure()
param mailIngressTlsCert string = ''

var prefix = 'ouro-${environmentName}'
var storageName = toLower(replace('${prefix}${uniqueString(resourceGroup().id)}', '-', ''))
var blobContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
var acrPullRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
var contributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
var mailIngressTlsEnabled = !empty(mailIngressTlsKey) && !empty(mailIngressTlsCert)
var mailIngressBaseArgs = [
  '--registry-azure-account-url'
  'https://${storageName}.blob.${az.environment().suffixes.storage}'
  '--registry-container'
  mailContainerName
  '--registry-blob'
  mailRegistryBlob
  '--registry-domain'
  mailDomain
  '--azure-account-url'
  'https://${storageName}.blob.${az.environment().suffixes.storage}'
  '--azure-managed-identity-client-id'
  identity.properties.clientId
  '--smtp-port'
  string(mailSmtpPort)
  '--http-port'
  string(mailHttpPort)
  '--max-recipients'
  string(mailIngressMaxRecipients)
  '--max-connections'
  string(mailIngressMaxConnections)
  '--connection-rate-limit-max'
  string(mailIngressConnectionRateLimitMax)
  '--connection-rate-limit-window-ms'
  string(mailIngressConnectionRateLimitWindowMs)
]
var mailIngressTlsArgs = mailIngressTlsEnabled ? [
  '--tls-key-file'
  '/mnt/secrets/mail-ingress-tls-key'
  '--tls-cert-file'
  '/mnt/secrets/mail-ingress-tls-cert'
] : []
var mailIngressArgs = concat(mailIngressBaseArgs, mailIngressTlsArgs)

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: containerRegistryName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
    networkRuleBypassOptions: 'AzureServices'
  }
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource outboundEmailService 'Microsoft.Communication/emailServices@2026-03-18' = {
  name: '${prefix}-email'
  location: 'global'
  properties: {
    dataLocation: outboundEmailDataLocation
  }
}

resource outboundEmailDomain 'Microsoft.Communication/emailServices/domains@2026-03-18' = if (!outboundEmailDomainExists) {
  parent: outboundEmailService
  name: mailDomain
  location: 'global'
  properties: {
    domainManagement: 'CustomerManaged'
    userEngagementTracking: 'Disabled'
  }
}

resource outboundEmailDomainExisting 'Microsoft.Communication/emailServices/domains@2026-03-18' existing = if (outboundEmailDomainExists) {
  parent: outboundEmailService
  name: mailDomain
}

var outboundEmailDomainId = outboundEmailDomainExists ? outboundEmailDomainExisting!.id : outboundEmailDomain!.id
var outboundEmailDomainName = outboundEmailDomainExists ? outboundEmailDomainExisting!.name : outboundEmailDomain!.name
var outboundEmailDomainVerificationRecords = outboundEmailDomainExists
  ? outboundEmailDomainExisting!.properties.verificationRecords
  : outboundEmailDomain!.properties.verificationRecords
var outboundEmailDomainVerificationStates = outboundEmailDomainExists
  ? outboundEmailDomainExisting!.properties.verificationStates
  : outboundEmailDomain!.properties.verificationStates

resource outboundCommunicationService 'Microsoft.Communication/communicationServices@2024-09-01-preview' = {
  name: '${prefix}-communication'
  location: 'global'
  properties: {
    dataLocation: outboundEmailDataLocation
    linkedDomains: outboundEmailLinkVerifiedDomain ? [
      outboundEmailDomainId
    ] : []
  }
}

resource mailContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storage.name}/default/${mailContainerName}'
  properties: {
    publicAccess: 'None'
  }
}

resource tripContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storage.name}/default/${tripContainerName}'
  properties: {
    publicAccess: 'None'
  }
}

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-services-mi'
  location: location
}

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: '${prefix}-vnet'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        virtualNetworkAddressPrefix
      ]
    }
  }
}

resource infrastructureSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: vnet
  name: 'container-apps'
  properties: {
    addressPrefix: infrastructureSubnetPrefix
    delegations: [
      {
        name: 'container-apps-environment'
        properties: {
          serviceName: 'Microsoft.App/environments'
        }
      }
    ]
  }
}

resource mailBlobAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, identity.id, blobContributorRoleId)
  scope: storage
  properties: {
    roleDefinitionId: blobContributorRoleId
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource acrPullAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, acrPullRoleId)
  scope: registry
  properties: {
    roleDefinitionId: acrPullRoleId
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource outboundEmailDomainContributorAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!outboundEmailDomainExists) {
  name: guid(outboundEmailDomainId, identity.id, contributorRoleId)
  scope: outboundEmailDomain
  properties: {
    roleDefinitionId: contributorRoleId
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource outboundEmailDomainExistingContributorAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (outboundEmailDomainExists) {
  name: guid(outboundEmailDomainId, identity.id, contributorRoleId)
  scope: outboundEmailDomainExisting
  properties: {
    roleDefinitionId: contributorRoleId
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-cae'
  location: location
  properties: {
    vnetConfiguration: {
      infrastructureSubnetId: infrastructureSubnet.id
      internal: false
    }
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

resource mailIngress 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-mail-ingress'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
      secrets: mailIngressTlsEnabled ? [
        {
          name: 'mail-ingress-tls-key'
          value: mailIngressTlsKey
        }
        {
          name: 'mail-ingress-tls-cert'
          value: mailIngressTlsCert
        }
      ] : []
      ingress: {
        external: true
        transport: 'http'
        targetPort: mailHttpPort
        allowInsecure: false
        additionalPortMappings: [
          {
            external: true
            targetPort: mailSmtpPort
            exposedPort: mailExposedSmtpPort
          }
        ]
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
    }
    template: {
      containers: [
        {
          name: 'mail-ingress'
          image: mailIngressImage
          args: mailIngressArgs
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          volumeMounts: mailIngressTlsEnabled ? [
            {
              volumeName: 'mail-ingress-tls'
              mountPath: '/mnt/secrets'
            }
          ] : []
          probes: [
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: mailHttpPort
              }
              initialDelaySeconds: 5
              periodSeconds: 15
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: mailHttpPort
              }
              initialDelaySeconds: 30
              periodSeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: mailIngressMinReplicas
        maxReplicas: mailIngressMaxReplicas
      }
      volumes: mailIngressTlsEnabled ? [
        {
          name: 'mail-ingress-tls'
          storageType: 'Secret'
          secrets: [
            {
              secretRef: 'mail-ingress-tls-key'
              path: 'mail-ingress-tls-key'
            }
            {
              secretRef: 'mail-ingress-tls-cert'
              path: 'mail-ingress-tls-cert'
            }
          ]
        }
      ] : []
    }
  }
  dependsOn: [
    acrPullAccess
    mailBlobAccess
    mailContainer
  ]
}

resource mailControl 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-mail-control'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
      secrets: [
        {
          name: 'mail-control-admin-token'
          value: mailControlAdminToken
        }
      ]
      ingress: {
        external: true
        transport: 'http'
        targetPort: 8080
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
    }
    template: {
      containers: [
        {
          name: 'mail-control'
          image: mailControlImage
          args: [
            '--azure-account-url'
            'https://${storage.name}.blob.${az.environment().suffixes.storage}'
            '--azure-managed-identity-client-id'
            identity.properties.clientId
            '--registry-container'
            mailContainerName
            '--registry-blob'
            mailRegistryBlob
            '--registry-domain'
            mailDomain
            '--admin-token-file'
            '/mnt/secrets/mail-control-admin-token'
            '--allowed-email-domain'
            mailDomain
            '--outbound-acs-subscription-id'
            subscription().subscriptionId
            '--outbound-acs-resource-group'
            resourceGroup().name
            '--outbound-acs-email-service'
            outboundEmailService.name
            '--outbound-acs-domain'
            outboundEmailDomainName
            '--port'
            '8080'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          volumeMounts: [
            {
              volumeName: 'control-secrets'
              mountPath: '/mnt/secrets'
            }
          ]
          probes: [
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 8080
              }
              initialDelaySeconds: 5
              periodSeconds: 15
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
      volumes: [
        {
          name: 'control-secrets'
          storageType: 'Secret'
          secrets: [
            {
              secretRef: 'mail-control-admin-token'
              path: 'mail-control-admin-token'
            }
          ]
        }
      ]
    }
  }
  dependsOn: [
    acrPullAccess
    mailBlobAccess
    mailContainer
  ]
}

resource vaultControl 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-vault-control'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
      secrets: [
        {
          name: 'vault-control-admin-token'
          value: vaultControlAdminToken
        }
      ]
      ingress: {
        external: true
        transport: 'http'
        targetPort: 8080
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
    }
    template: {
      containers: [
        {
          name: 'vault-control'
          image: vaultControlImage
          args: [
            '--vault-server-url'
            vaultServerUrl
            '--admin-token-file'
            '/mnt/secrets/vault-control-admin-token'
            '--allowed-email-domain'
            mailDomain
            '--port'
            '8080'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          volumeMounts: [
            {
              volumeName: 'control-secrets'
              mountPath: '/mnt/secrets'
            }
          ]
          probes: [
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 8080
              }
              initialDelaySeconds: 5
              periodSeconds: 15
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
      }
      volumes: [
        {
          name: 'control-secrets'
          storageType: 'Secret'
          secrets: [
            {
              secretRef: 'vault-control-admin-token'
              path: 'vault-control-admin-token'
            }
          ]
        }
      ]
    }
  }
  dependsOn: [
    acrPullAccess
  ]
}

resource tripControl 'Microsoft.App/containerApps@2024-03-01' = if (!empty(tripControlImage)) {
  name: '${prefix}-trip-control'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
      secrets: [
        {
          name: 'trip-control-admin-token'
          value: tripControlAdminToken
        }
      ]
      ingress: {
        external: true
        transport: 'http'
        targetPort: 8080
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
    }
    template: {
      containers: [
        {
          name: 'trip-control'
          image: tripControlImage
          args: [
            '--azure-account-url'
            'https://${storage.name}.blob.${az.environment().suffixes.storage}'
            '--azure-managed-identity-client-id'
            identity.properties.clientId
            '--registry-container'
            tripContainerName
            '--admin-token-file'
            '/mnt/secrets/trip-control-admin-token'
            '--port'
            '8080'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          volumeMounts: [
            {
              volumeName: 'control-secrets'
              mountPath: '/mnt/secrets'
            }
          ]
          probes: [
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 8080
              }
              initialDelaySeconds: 5
              periodSeconds: 15
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
      }
      volumes: [
        {
          name: 'control-secrets'
          storageType: 'Secret'
          secrets: [
            {
              secretRef: 'trip-control-admin-token'
              path: 'trip-control-admin-token'
            }
          ]
        }
      ]
    }
  }
  dependsOn: [
    acrPullAccess
    mailBlobAccess
    tripContainer
  ]
}

output containerRegistryName string = registry.name
output containerRegistryLoginServer string = registry.properties.loginServer
output mailIngressFqdn string = mailIngress.properties.configuration.ingress.fqdn
output mailSmtpPort int = mailExposedSmtpPort
output mailStorageAccountUrl string = 'https://${storage.name}.blob.${az.environment().suffixes.storage}'
output mailControlFqdn string = mailControl.properties.configuration.ingress.fqdn
output vaultControlFqdn string = vaultControl.properties.configuration.ingress.fqdn
output tripControlFqdn string = !empty(tripControlImage) ? tripControl.properties.configuration.ingress.fqdn : ''
output outboundAcsEndpoint string = 'https://${outboundCommunicationService.name}.communication.azure.com'
output outboundCommunicationServiceName string = outboundCommunicationService.name
output outboundEmailServiceName string = outboundEmailService.name
output outboundEmailDomainName string = outboundEmailDomainName
output outboundEmailDomainVerificationRecords object = outboundEmailDomainVerificationRecords
output outboundEmailDomainVerificationStates object = outboundEmailDomainVerificationStates
output outboundDeliveryEventSubscriptionName string = '${prefix}-acs-email-delivery'
