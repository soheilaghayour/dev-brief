import { Controller, Get, Param } from '@nestjs/common';
import { ClusterDetailSchema, ClusterIdSchema } from '@devbrief/shared';
import { PublicCache } from '../../common/cache/cacheControl.js';
import { RequiresFeature } from '../../common/features/requiresFeature.decorator.js';
import { Contract } from '../../common/zod/contract.decorator.js';
import { ZodPipe } from '../../common/zod/zod.pipe.js';
import { ClustersService } from './clusters.service.js';

@Controller('clusters')
@RequiresFeature('clusters')
export class ClustersController {
  constructor(private readonly clusters: ClustersService) {}

  @Get(':id')
  @PublicCache()
  @Contract({ response: ClusterDetailSchema })
  detail(@Param('id', new ZodPipe(ClusterIdSchema)) id: string) {
    return this.clusters.getDetail(id);
  }
}
