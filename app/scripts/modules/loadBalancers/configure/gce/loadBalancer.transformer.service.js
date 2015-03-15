'use strict';


angular.module('deckApp.gce.loadBalancer.transformer.service', [
  'deckApp.settings',
  'deckApp.utils.lodash'
])
  .factory('gceLoadBalancerTransformer', function ( settings, _) {

    function updateHealthCounts(loadBalancer) {
      var instances = loadBalancer.instances;
      loadBalancer.healthCounts = {
        upCount: instances.filter(function (instance) {
          return instance.isHealthy;
        }).length,
        downCount: instances.filter(function (instance) {
          return instance.healthState === 'Down';
        }).length,
        unknownCount: instances.filter(function (instance) {
          return instance.healthState === 'Unknown' || instance.healthState === 'Starting';
        }).length
      };
    }

    function normalizeLoadBalancerWithServerGroups(loadBalancer, application) {
      var serverGroups = application.serverGroups.filter(function(serverGroup) {
        return serverGroupIsInLoadBalancer(serverGroup, loadBalancer);
      });
      loadBalancer.serverGroups = _.sortBy(serverGroups, 'name');
      loadBalancer.instances = _(serverGroups).filter({isDisabled: false}).collect('instances').flatten().valueOf();
      updateHealthCounts(loadBalancer);
    }

    function serverGroupIsInLoadBalancer(serverGroup, loadBalancer) {
      return serverGroup.type === 'gce' &&
        serverGroup.account === loadBalancer.account &&
        serverGroup.region === loadBalancer.region &&
        serverGroup.loadBalancers.indexOf(loadBalancer.name) !== -1;
    }

    function convertLoadBalancerForEditing(loadBalancer) {
      var toEdit = {
        provider: 'gce',
        editMode: true,
        region: loadBalancer.region,
        credentials: loadBalancer.account,
        listeners: [],
        name: loadBalancer.name,
        regionZones: loadBalancer.availabilityZones
      };

      if (loadBalancer.elb) {
        var elb = loadBalancer.elb;

        toEdit.securityGroups = elb.securityGroups;
        toEdit.vpcId = elb.vpcid;

        if (elb.listenerDescriptions) {
          toEdit.listeners = elb.listenerDescriptions.map(function (description) {
            var listener = description.listener;
            return {
              internalProtocol: listener.instanceProtocol,
              internalPort: listener.instancePort,
              externalProtocol: listener.protocol,
              externalPort: listener.loadBalancerPort
            };
          });
        }

        if (elb.healthCheck && elb.healthCheck.target) {
          toEdit.healthTimeout = elb.healthCheck.timeout;
          toEdit.healthInterval = elb.healthCheck.interval;
          toEdit.healthyThreshold = elb.healthCheck.healthyThreshold;
          toEdit.unhealthyThreshold = elb.healthCheck.unhealthyThreshold;

          var healthCheck = loadBalancer.elb.healthCheck.target;
          var protocolIndex = healthCheck.indexOf(':'),
            pathIndex = healthCheck.indexOf('/');

          if (protocolIndex !== -1 && pathIndex !== -1) {
            toEdit.healthCheckProtocol = healthCheck.substring(0, protocolIndex);
            toEdit.healthCheckPort = healthCheck.substring(protocolIndex + 1, pathIndex);
            toEdit.healthCheckPath = healthCheck.substring(pathIndex);
            if (!isNaN(toEdit.healthCheckPort)) {
              toEdit.healthCheckPort = Number(toEdit.healthCheckPort);
            }
          }
        }
      }
      return toEdit;
    }

    function constructNewLoadBalancerTemplate() {
      return {
        provider: 'gce',
        stack: '',
        detail: 'frontend',
        credentials: settings.providers.gce ? settings.providers.gce.defaults.account : null,
        region: settings.providers.gce ? settings.providers.gce.defaults.region : null,
        healthCheckProtocol: 'HTTP',
        healthCheckPort: 80,
        healthCheckPath: '/',
        healthTimeout: 5,
        healthInterval: 10,
        healthyThreshold: 10,
        unhealthyThreshold: 2,
        regionZones: [],
        listeners: [
          {
            protocol: 'TCP',
            portRange: '8080',
            healthCheck: true
          }
        ]
      };
    }

    return {
      normalizeLoadBalancerWithServerGroups: normalizeLoadBalancerWithServerGroups,
      serverGroupIsInLoadBalancer: serverGroupIsInLoadBalancer,
      convertLoadBalancerForEditing: convertLoadBalancerForEditing,
      constructNewLoadBalancerTemplate: constructNewLoadBalancerTemplate,
    };

  });
